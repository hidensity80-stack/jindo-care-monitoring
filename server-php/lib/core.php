<?php
/**
 * 공통 함수: DB 연결, 날짜·상태 계산, 일정 생성, 위험 판정, 데모 기록 생성
 */
declare(strict_types=1);

// 서버마다 다른 설정(DB 비밀번호, 설치 키)은 config.php에 두고 저장소에는 올리지 않습니다.
// config.php가 없으면 예시 설정(config.example.php)으로 동작합니다.
$CFG = require (is_file(__DIR__ . '/../config.php') ? __DIR__ . '/../config.php' : __DIR__ . '/../config.example.php');
date_default_timezone_set($CFG['TIMEZONE']);

const EMD = ['진도읍', '고군면', '군내면', '의신면', '임회면', '지산면', '조도면'];
const HOUSE = ['독거', '부부', '자녀 동거'];
const WD = ['일', '월', '화', '수', '목', '금', '토'];
const STATUS_LABEL = ['plan' => '예정', 'prog' => '진행중', 'done' => '완료', 'late' => '지연', 'miss' => '미수행', 'cancel' => '취소'];

function cfg(string $k)
{
    global $CFG;
    return $CFG[$k];
}

function db(): PDO
{
    static $pdo = null;
    if ($pdo) return $pdo;
    $dsn = cfg('DB_DSN');
    if (str_starts_with($dsn, 'sqlite:')) {
        $dir = dirname(substr($dsn, 7));
        if (!is_dir($dir)) mkdir($dir, 0775, true);
    }
    $pdo = new PDO($dsn, cfg('DB_USER'), cfg('DB_PASS'), [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
    ]);
    if (is_sqlite()) {
        $pdo->exec('PRAGMA journal_mode=WAL');
        $pdo->exec('PRAGMA synchronous=NORMAL');
        $pdo->exec('PRAGMA foreign_keys=ON');
    }
    return $pdo;
}

function is_sqlite(): bool
{
    return str_starts_with(cfg('DB_DSN'), 'sqlite:');
}

function q(string $sql, array $p = []): PDOStatement
{
    $st = db()->prepare($sql);
    $st->execute($p);
    return $st;
}

/** 여러 행을 한 번에 INSERT (100행 단위) */
function batch_insert(string $table, array $cols, array &$rows, bool $ignore = false): void
{
    if (!$rows) return;
    $ph = '(' . implode(',', array_fill(0, count($cols), '?')) . ')';
    $verb = $ignore ? (is_sqlite() ? 'INSERT OR IGNORE INTO' : 'INSERT IGNORE INTO') : 'INSERT INTO';
    foreach (array_chunk($rows, 100) as $chunk) {
        $sql = "$verb $table (" . implode(',', $cols) . ') VALUES ' . implode(',', array_fill(0, count($chunk), $ph));
        $vals = [];
        foreach ($chunk as $r) foreach ($r as $v) $vals[] = $v;
        db()->prepare($sql)->execute($vals);
    }
    $rows = [];
}

function kv_get(string $k): ?string
{
    $r = q('SELECT v FROM settings WHERE k=?', [$k])->fetch();
    return $r ? $r['v'] : null;
}

function kv_set(string $k, string $v): void
{
    q('DELETE FROM settings WHERE k=?', [$k]);
    q('INSERT INTO settings (k, v) VALUES (?, ?)', [$k, $v]);
}

/* ---------- 날짜·시각 ---------- */
function today(): string
{
    return date('Y-m-d');
}
function now_min(): int
{
    return (int)date('G') * 60 + (int)date('i');
}
function hm(int $m): string
{
    return sprintf('%02d:%02d', intdiv($m, 60), $m % 60);
}
function add_days(string $d, int $n): string
{
    return date('Y-m-d', strtotime("$d $n day"));
}
function min_of(?string $dt): ?int
{
    if (!$dt) return null;
    return (int)substr($dt, 11, 2) * 60 + (int)substr($dt, 14, 2);
}
/** 0~1 사이의 결정적 난수 (데모 데이터용) */
function h01(...$parts): float
{
    return crc32(implode(':', $parts)) / 4294967296;
}

/* ---------- 서비스 ---------- */
function services(): array
{
    static $s = null;
    if ($s) return $s;
    $s = [];
    foreach (q('SELECT * FROM services ORDER BY id') as $r) {
        $r['flags'] = json_decode($r['flags'], true);
        $s[(int)$r['id']] = $r;
    }
    return $s;
}

/* ---------- 이용 일정 규칙 ---------- */
function rule_matches(array $rule, int $dow, int $wom): bool
{
    switch ($rule['type']) {
        case 'weekly':   return in_array($dow, $rule['days'], true);          // 매주 특정 요일
        case 'weekdays': return $dow >= 1 && $dow <= 5;                      // 평일 매일
        case 'daily':    return true;                                        // 매일
        case 'monthly':  return in_array($dow, $rule['days'], true) && in_array($wom, $rule['weeks'], true); // 매월 n째 주 요일
    }
    return false;
}

function rule_text(array $rule): string
{
    $d = implode('·', array_map(fn($x) => WD[$x], $rule['days'] ?? []));
    switch ($rule['type']) {
        case 'weekly':   return "매주 $d";
        case 'weekdays': return '평일 매일';
        case 'daily':    return '매일 자동 안부확인';
        case 'monthly':  return '매월 ' . implode('·', $rule['weeks']) . "째 {$d}요일";
    }
    return '';
}

/**
 * 기간 안의 방문 일정을 이용 규칙에 따라 생성합니다.
 * 같은 날·같은 이용건은 한 번만 만들어집니다(중복 실행 안전).
 * 담당자별로 서비스 시작 시각부터 (소요시간+이동시간) 간격으로 시간을 배정합니다.
 */
function generate_schedules(string $from, string $to, ?int $onlySid = null): int
{
    $sv = services();
    $ens = q('SELECT e.*, r.status AS rstatus FROM enrollments e JOIN recipients r ON r.id=e.recipient_id ORDER BY e.worker_id, e.recipient_id')->fetchAll();
    if ($onlySid) $ens = array_values(array_filter($ens, fn($e) => (int)$e['service_id'] === $onlySid));
    foreach ($ens as &$e) $e['rule'] = json_decode($e['rule'], true);
    unset($e);
    $rows = [];
    $n = 0;
    for ($d = $from; $d <= $to; $d = add_days($d, 1)) {
        $ts = strtotime($d);
        $dow = (int)date('w', $ts);
        $wom = (int)ceil((int)date('j', $ts) / 7);
        $slot = [];
        foreach ($ens as $e) {
            if ($e['rstatus'] !== 'active') continue;
            if ($e['start_date'] > $d) continue;
            if ($e['end_date'] && $e['end_date'] < $d) continue;
            if (!rule_matches($e['rule'], $dow, $wom)) continue;
            $s = $sv[(int)$e['service_id']];
            $i = $slot[$e['worker_id']] = ($slot[$e['worker_id']] ?? -1) + 1;
            $t = (int)$s['start_min'] + $i * ((int)$s['dur'] + (int)$s['gap']);
            $rows[] = [$d, (int)$e['id'], (int)$e['recipient_id'], (int)$e['service_id'], (int)$e['worker_id'], $t, (int)$s['dur']];
            $n++;
            if (count($rows) >= 2000) batch_insert('schedules', ['date', 'enrollment_id', 'recipient_id', 'service_id', 'worker_id', 'planned_min', 'duration'], $rows, true);
        }
    }
    batch_insert('schedules', ['date', 'enrollment_id', 'recipient_id', 'service_id', 'worker_id', 'planned_min', 'duration'], $rows, true);
    return $n;
}

/* ---------- 상태 ---------- */
/** 일정 1건의 현재 상태: plan 예정, prog 진행중, done 완료, late 지연, miss 미수행, cancel 취소 */
function status_of(array $r, string $today, int $now): string
{
    if (($r['vstatus'] ?? null) === 'cancel') return 'cancel';
    if (!empty($r['ended_at'])) return 'done';
    if ($r['date'] < $today) return 'miss';
    if ($r['date'] > $today) return 'plan';
    if (!empty($r['started_at'])) return 'prog';
    return ($now - (int)$r['planned_min'] >= 30) ? 'late' : 'plan';
}

/** 일정 + 수행기록 조회 */
function fetch_schedules(string $from, string $to, string $extra = '', array $p = []): array
{
    $sql = "SELECT s.id, s.date, s.recipient_id, s.service_id, s.worker_id, s.planned_min, s.duration,
                   v.status AS vstatus, v.started_at, v.ended_at, v.health, v.flags, v.note, v.cancel_reason
            FROM schedules s LEFT JOIN visits v ON v.schedule_id = s.id
            WHERE s.date BETWEEN ? AND ? $extra
            ORDER BY s.date, s.planned_min, s.id";
    return q($sql, array_merge([$from, $to], $p))->fetchAll();
}

/** 일정 행을 화면용으로 변환 */
function rec_out(array $r, string $today, int $now): array
{
    $st = status_of($r, $today, $now);
    return [
        'id' => (int)$r['id'], 'date' => $r['date'], 'rid' => (int)$r['recipient_id'], 'sid' => (int)$r['service_id'],
        'wid' => (int)$r['worker_id'], 't' => (int)$r['planned_min'], 'd' => (int)$r['duration'], 'st' => $st,
        'start' => min_of($r['started_at']), 'end' => min_of($r['ended_at']),
        'h' => $r['health'] === null ? null : (int)$r['health'],
        'flags' => $r['flags'] ? json_decode($r['flags'], true) : [], 'note' => $r['note'], 'reason' => $r['cancel_reason'],
    ];
}

/* ---------- 위험 판정 ---------- */
function compute_risk(?int $sid = null): array
{
    $R = cfg('RISK');
    $today = today();
    $now = now_min();
    $from = add_days($today, -($R['WINDOW_DAYS'] - 1));
    $sv = services();
    $out = [];
    $sql = $sid
        ? "SELECT DISTINCT r.id, r.household FROM recipients r JOIN enrollments e ON e.recipient_id=r.id WHERE r.status='active' AND e.service_id=?"
        : "SELECT id, household FROM recipients WHERE status='active'";
    foreach (q($sql, $sid ? [$sid] : []) as $r) {
        $out[(int)$r['id']] = ['bad' => 0, 'miss' => 0, 'late' => 0, 'svc' => [], 'flags' => [], 'alone' => (int)$r['household'] === 0];
    }
    foreach (($sid ? fetch_schedules($from, $today, 'AND s.service_id = ?', [$sid]) : fetch_schedules($from, $today)) as $r) {
        $id = (int)$r['recipient_id'];
        if (!isset($out[$id])) continue;
        $st = status_of($r, $today, $now);
        $o = &$out[$id];
        if ($st === 'done' && (int)$r['health'] === 2) {
            $o['bad']++;
            $o['svc'][(int)$r['service_id']] = true;
            foreach (json_decode($r['flags'] ?: '[]', true) as $f) $o['flags'][$f] = ($o['flags'][$f] ?? 0) + 1;
        } elseif ($st === 'miss') $o['miss']++;
        elseif ($st === 'late') $o['late']++;
        unset($o);
    }
    $res = [];
    foreach ($out as $id => $o) {
        $ns = count($o['svc']);
        $score = $o['bad'] * $R['BAD_POINT'] + ($ns >= 2 ? $R['MULTI_SVC_POINT'] : 0) + $o['miss'] * $R['MISS_POINT']
            + $o['late'] * $R['LATE_POINT'] + (($o['alone'] && $o['bad']) ? $R['ALONE_POINT'] : 0);
        $level = $score >= $R['LEVEL_DANGER'] ? 3 : ($score >= $R['LEVEL_WARN'] ? 2 : ($score >= $R['LEVEL_WATCH'] ? 1 : 0));
        $reasons = [];
        if ($o['bad']) $reasons[] = "최근 {$R['WINDOW_DAYS']}일 건강상태 '나쁨' {$o['bad']}회";
        if ($ns >= 2) $reasons[] = implode('·', array_map(fn($s) => $sv[$s]['short'], array_keys($o['svc']))) . " 등 {$ns}개 서비스에서 이상 보고";
        if ($o['flags']) {
            arsort($o['flags']);
            $top = array_slice($o['flags'], 0, 2, true);
            $reasons[] = '주요 징후: ' . implode(', ', array_map(fn($f, $n) => "$f($n)", array_keys($top), $top));
        }
        if ($o['miss']) $reasons[] = "미수행 {$o['miss']}회";
        if ($o['late']) $reasons[] = '오늘 방문 지연·미시작';
        if ($o['alone'] && $o['bad']) $reasons[] = '독거 가구';
        $res[$id] = ['score' => $score, 'level' => $level, 'reasons' => $reasons];
    }
    return $res;
}

/* ---------- 데모: 현장 앱 입력 흉내 ---------- */
/**
 * DEMO_MODE일 때, 오늘까지의 일정에 대해 시각에 맞춰 시작·종료·건강상태 기록을 채웁니다.
 * 일부는 취소·지연·미수행이 되도록 일정 번호로 결정된 값을 씁니다.
 */
function demo_tick(?string $fromOverride = null): void
{
    if (!cfg('DEMO_MODE')) return;
    $today = today();
    $now = now_min();
    $from = $fromOverride ?? (kv_get('demo_last_date') ?? $today);
    $sv = services();
    $db = db();
    $db->beginTransaction();
    try {
        $ins = [];
        for ($d = $from; $d <= $today; $d = add_days($d, 1)) {
            $isToday = $d === $today;
            $recent = $d > add_days($today, -12);
            $rows = q("SELECT s.id, s.date, s.planned_min, s.duration, s.service_id,
                              r.demo_risk, r.demo_trend, w.demo_slack, v.id AS vid, v.status AS vstatus, v.ended_at
                       FROM schedules s
                       JOIN recipients r ON r.id = s.recipient_id
                       JOIN workers w ON w.id = s.worker_id
                       LEFT JOIN visits v ON v.schedule_id = s.id
                       WHERE s.date = ? AND (v.id IS NULL OR (v.ended_at IS NULL AND v.status <> 'cancel'))", [$d])->fetchAll();
            foreach ($rows as $r) {
                $id = (int)$r['id'];
                $x = h01($id, 'o');
                $mp = 0.004 + (float)$r['demo_slack'] * 0.045;
                $t = (int)$r['planned_min'];
                if ($x < 0.012) { // 취소
                    if (!$r['vid'] && (!$isToday || $now >= $t - 60)) {
                        $reason = ['병원 입원', '가족 방문', '본인 거절', '외출 부재'][(int)(h01($id, 'c') * 4)];
                        $ins[] = [$id, 'cancel', null, null, null, null, null, $reason, 'demo'];
                    }
                    continue;
                }
                if ($x < 0.012 + $mp) continue; // 미수행 (기록 없음)
                $delay = $x < 0.042 + $mp ? 35 + (int)(h01($id, 'l') * 55) : (int)(h01($id, 'd') * 14);
                $start = $t + $delay;
                $end = $start + max(2, (int)round((int)$r['duration'] * (0.85 + h01($id, 'u') * 0.3)));
                if ($isToday && $now < $start) continue;
                $done = !$isToday || $now >= $end;
                $health = null;
                $flags = null;
                if ($done) {
                    $s = $sv[(int)$r['service_id']];
                    $p = (float)$r['demo_risk'] * (((int)$r['demo_trend'] && $recent) ? 1.6 : 1) * ($s['code'] === 'smart' ? 0.4 : 1);
                    $y = h01($id, 'h');
                    $health = $y < $p ? 2 : ($y < $p + 0.24 ? 1 : 0);
                    if ($health === 2) {
                        $fl = $s['flags'];
                        $a = (int)(h01($id, 'f') * count($fl));
                        $f = [$fl[$a]];
                        if (count($fl) > 1 && h01($id, 'g') < 0.3) $f[] = $fl[($a + 1) % count($fl)];
                        $flags = json_encode($f, JSON_UNESCAPED_UNICODE);
                    }
                }
                $sa = "$d " . hm(min($start, 1439)) . ':00';
                $ea = $done ? "$d " . hm(min($end, 1439)) . ':00' : null;
                if ($r['vid']) {
                    if ($done) q('UPDATE visits SET status=?, ended_at=?, health=?, flags=? WHERE id=?', ['done', $ea, $health, $flags, $r['vid']]);
                } else {
                    $ins[] = [$id, $done ? 'done' : 'started', $sa, $ea, $health, $flags, null, null, 'demo'];
                }
                if (count($ins) >= 2000) batch_insert('visits', ['schedule_id', 'status', 'started_at', 'ended_at', 'health', 'flags', 'note', 'cancel_reason', 'source'], $ins);
            }
        }
        batch_insert('visits', ['schedule_id', 'status', 'started_at', 'ended_at', 'health', 'flags', 'note', 'cancel_reason', 'source'], $ins);
        kv_set('demo_last_date', $today);
        $db->commit();
    } catch (Throwable $e) {
        $db->rollBack();
        throw $e;
    }
}

/* =====================================================================
 * 로그인 · 권한 · 접속기록
 * ===================================================================== */
const ROLE_LABEL = [
    'admin'   => '시스템 관리자',
    'central' => '총괄 담당자',
    'org'     => '수행기관 관리자',
    'worker'  => '현장 수행자',
    'viewer'  => '조회 전용',
];
const DEMO_PASSWORD = 'jindo1234';

function session_boot(): void
{
    if (session_status() === PHP_SESSION_ACTIVE || PHP_SAPI === 'cli') return;
    session_name('JDCARE');
    session_set_cookie_params(['lifetime' => 0, 'path' => '/', 'httponly' => true, 'samesite' => 'Lax', 'secure' => !empty($_SERVER['HTTPS'])]);
    session_start();
}

/** 로그인한 사용자 (없으면 null). 관리자 30분, 현장 수행자 12시간 미사용 시 자동 로그아웃 */
function current_user(bool $refresh = false): ?array
{
    static $u = false;
    if ($u !== false && !$refresh) return $u;
    session_boot();
    $u = null;
    if (empty($_SESSION['uid'])) return null;
    $idle = ($_SESSION['role'] ?? '') === 'worker' ? 12 * 3600 : 30 * 60;
    if (time() - ($_SESSION['last'] ?? 0) > $idle) {
        $_SESSION = [];
        session_destroy();
        return null;
    }
    $_SESSION['last'] = time();
    $r = q('SELECT u.*, s.name AS sname, s.short AS sshort, s.vendor, s.role AS srole
            FROM users u LEFT JOIN services s ON s.id = u.org_id WHERE u.id = ? AND u.active = 1', [$_SESSION['uid']])->fetch();
    $u = $r ?: null;
    return $u;
}

function is_role(string ...$roles): bool
{
    $u = current_user();
    return $u !== null && in_array($u['role'], $roles, true);
}

/** 조회 범위: 수행기관 관리자는 자기 서비스만 (null = 전체) */
function scope_sid(): ?int
{
    $u = current_user();
    return ($u && $u['role'] === 'org') ? (int)$u['org_id'] : null;
}

function home_for(string $role): string
{
    return $role === 'worker' ? 'field.php' : 'index.php';
}

/** 화면(php 페이지) 접근 확인: 로그인 안 했으면 로그인 화면, 역할이 다르면 자기 첫 화면으로 */
function require_page(array $roles): array
{
    $u = current_user();
    if (!$u) { header('Location: login.php'); exit; }
    if (!in_array($u['role'], $roles, true)) { header('Location: ' . home_for($u['role'])); exit; }
    return $u;
}

function audit(string $action, string $target = '', string $detail = '', ?array $who = null): void
{
    $u = $who ?? current_user();
    try {
        q('INSERT INTO audit_logs (at, user_id, login_id, action, target, detail, ip) VALUES (?,?,?,?,?,?,?)', [
            date('Y-m-d H:i:s'), $u['id'] ?? null, $u['login_id'] ?? null, $action,
            mb_substr($target, 0, 100), mb_substr($detail, 0, 500), $_SERVER['REMOTE_ADDR'] ?? 'cli']);
    } catch (Throwable $e) {
        error_log((string)$e);
    }
}

/** @return array{0:bool,1:string} [성공 여부, 실패 메시지 또는 역할] */
function attempt_login(string $id, string $pw): array
{
    $u = q('SELECT * FROM users WHERE login_id = ?', [$id])->fetch();
    if (!$u || !(int)$u['active']) {
        audit('login_fail', $id, '없는 계정 또는 정지된 계정', ['id' => null, 'login_id' => $id]);
        return [false, '아이디 또는 비밀번호가 맞지 않습니다.'];
    }
    if ($u['locked_until'] && $u['locked_until'] > date('Y-m-d H:i:s')) {
        return [false, '비밀번호를 5회 틀려 ' . substr($u['locked_until'], 11, 5) . '까지 로그인할 수 없습니다.'];
    }
    if (!password_verify($pw, $u['pw_hash'])) {
        $f = (int)$u['fail_count'] + 1;
        q('UPDATE users SET fail_count = ?, locked_until = ? WHERE id = ?', [$f >= 5 ? 0 : $f, $f >= 5 ? date('Y-m-d H:i:s', time() + 600) : null, $u['id']]);
        audit('login_fail', $id, "비밀번호 오류 {$f}회", $u);
        return [false, $f >= 5 ? '비밀번호를 5회 틀려 10분 동안 로그인할 수 없습니다.' : "아이디 또는 비밀번호가 맞지 않습니다. ({$f}/5)"];
    }
    session_boot();
    session_regenerate_id(true);
    $_SESSION['uid'] = (int)$u['id'];
    $_SESSION['role'] = $u['role'];
    $_SESSION['last'] = time();
    q('UPDATE users SET fail_count = 0, locked_until = NULL, last_login = ? WHERE id = ?', [date('Y-m-d H:i:s'), $u['id']]);
    audit('login', $id, ROLE_LABEL[$u['role']] ?? $u['role'], $u);
    return [true, $u['role']];
}

function temp_password(): string
{
    $c = 'abcdefghjkmnpqrstuvwxyz23456789';
    $s = '';
    for ($i = 0; $i < 8; $i++) $s .= $c[random_int(0, strlen($c) - 1)];
    return $s;
}

/* =====================================================================
 * 월간 계획 (작성중 → 제출 → 승인 / 반려)
 * ===================================================================== */
function ym_of(string $date): string
{
    return substr($date, 0, 7);
}

function plan_status(int $sid, string $ym): array
{
    $r = q('SELECT * FROM plans WHERE org_id = ? AND ym = ?', [$sid, $ym])->fetch();
    return $r ?: ['org_id' => $sid, 'ym' => $ym, 'status' => '작성중', 'note' => null, 'submitted_at' => null, 'submitted_by' => null, 'decided_at' => null, 'decided_by' => null];
}

function plan_set(int $sid, string $ym, array $f): void
{
    $row = array_merge(plan_status($sid, $ym), $f);
    q('DELETE FROM plans WHERE org_id = ? AND ym = ?', [$sid, $ym]);
    q('INSERT INTO plans (org_id, ym, status, note, submitted_at, submitted_by, decided_at, decided_by) VALUES (?,?,?,?,?,?,?,?)',
      [$sid, $ym, $row['status'], $row['note'], $row['submitted_at'], $row['submitted_by'], $row['decided_at'], $row['decided_by']]);
}

function plan_editable(int $sid, string $ym): bool
{
    return in_array(plan_status($sid, $ym)['status'], ['작성중', '반려'], true);
}

/** 제출 전 자동 점검: 계약 횟수 미달, 같은 담당자 시간 겹침, 일요일 일정 */
function plan_check(int $sid, string $ym): array
{
    $from = "$ym-01";
    $to = date('Y-m-t', strtotime($from));
    $code = services()[$sid]['code'] ?? '';
    $cnt = [];
    foreach (q('SELECT enrollment_id, COUNT(*) c FROM schedules WHERE service_id = ? AND date BETWEEN ? AND ? GROUP BY enrollment_id', [$sid, $from, $to]) as $r) {
        $cnt[(int)$r['enrollment_id']] = (int)$r['c'];
    }
    $days = [];
    for ($d = $from; $d <= $to; $d = add_days($d, 1)) {
        $ts = strtotime($d);
        $days[] = [$d, (int)date('w', $ts), (int)ceil((int)date('j', $ts) / 7)];
    }
    $short = [];
    $ens = q("SELECT e.*, r.name FROM enrollments e JOIN recipients r ON r.id = e.recipient_id WHERE e.service_id = ? AND r.status = 'active'", [$sid])->fetchAll();
    foreach ($ens as $e) {
        $rule = json_decode($e['rule'], true);
        $exp = 0;
        foreach ($days as [$d, $dow, $wom]) {
            if ($e['start_date'] > $d || ($e['end_date'] && $e['end_date'] < $d)) continue;
            if (rule_matches($rule, $dow, $wom)) $exp++;
        }
        $p = $cnt[(int)$e['id']] ?? 0;
        if ($p < $exp) $short[] = ['rid' => (int)$e['recipient_id'], 'name' => $e['name'], 'expected' => $exp, 'planned' => $p];
    }
    $rows = q('SELECT s.date, s.worker_id, s.planned_min, s.duration, r.name, w.name AS wname
               FROM schedules s JOIN recipients r ON r.id = s.recipient_id JOIN workers w ON w.id = s.worker_id
               WHERE s.service_id = ? AND s.date BETWEEN ? AND ? ORDER BY s.worker_id, s.date, s.planned_min', [$sid, $from, $to])->fetchAll();
    $ov = [];
    $sun = 0;
    $prev = null;
    foreach ($rows as $r) {
        if ($prev && (int)$prev['worker_id'] === (int)$r['worker_id'] && $prev['date'] === $r['date']
            && (int)$r['planned_min'] < (int)$prev['planned_min'] + (int)$prev['duration']) {
            $ov[] = ['date' => $r['date'], 'worker' => $r['wname'], 'a' => $prev['name'] . ' ' . hm((int)$prev['planned_min']), 'b' => $r['name'] . ' ' . hm((int)$r['planned_min'])];
        }
        if ($code !== 'smart' && (int)date('w', strtotime($r['date'])) === 0) $sun++;
        $prev = $r;
    }
    return ['total' => count($rows), 'shortfall' => $short, 'overlaps' => $ov, 'sundays' => $sun];
}

/** 일정 1건을 수행기관이 직접 고칠 수 있는지. 고칠 수 없으면 그 이유를 돌려줌 */
function schedule_lock_reason(array $s): ?string
{
    if (!plan_editable((int)$s['service_id'], ym_of($s['date']))) return '이 달 계획은 제출 또는 승인되어 바로 고칠 수 없습니다. 변경 요청을 올려 주세요.';
    if ($s['date'] <= today()) return '오늘과 지난 날짜의 일정은 고칠 수 없습니다.';
    if (q('SELECT 1 FROM visits WHERE schedule_id = ?', [$s['id']])->fetch()) return '이미 수행기록이 있는 일정입니다.';
    return null;
}
