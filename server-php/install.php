<?php
/**
 * 설치 스크립트: 테이블을 만들고 예시 데이터(수혜자 600명, 담당자 210명, 올해 일정)를 넣습니다.
 *
 * 실행 방법
 *   명령줄:   php install.php
 *   브라우저: http://서버주소/install.php?key=설정파일의_INSTALL_KEY
 *
 * 주의: 기존 테이블을 모두 지우고 다시 만듭니다. 설치 후 이 파일은 삭제하세요.
 */
declare(strict_types=1);
require __DIR__ . '/lib/core.php';

$cli = PHP_SAPI === 'cli';
if (!$cli) {
    header('Content-Type: text/plain; charset=utf-8');
    if (($_GET['key'] ?? '') !== cfg('INSTALL_KEY')) {
        http_response_code(403);
        exit("설치 키가 맞지 않습니다. config.php의 INSTALL_KEY 값을 ?key= 로 넘겨 주세요.\n");
    }
}
set_time_limit(0);
ini_set('memory_limit', '512M');
function say(string $m): void
{
    echo $m . "\n";
    @ob_flush();
    @flush();
}

$t0 = microtime(true);
$AI = is_sqlite() ? 'INTEGER PRIMARY KEY AUTOINCREMENT' : 'INT AUTO_INCREMENT PRIMARY KEY';
$ENGINE = is_sqlite() ? '' : ' ENGINE=InnoDB DEFAULT CHARSET=utf8mb4';

/* ---------- 1. 테이블 ---------- */
$drop = ['visits', 'schedules', 'enrollments', 'care_cases', 'reports', 'recipients', 'workers', 'services', 'settings',
         'users', 'audit_logs', 'plans', 'change_requests', 'emergencies'];
if (!is_sqlite()) db()->exec('SET FOREIGN_KEY_CHECKS=0');
foreach ($drop as $t) db()->exec("DROP TABLE IF EXISTS $t");
if (!is_sqlite()) db()->exec('SET FOREIGN_KEY_CHECKS=1');

$ddl = [
"CREATE TABLE settings (k VARCHAR(64) PRIMARY KEY, v TEXT)$ENGINE",
"CREATE TABLE services (
   id INT PRIMARY KEY, code VARCHAR(20) NOT NULL, name VARCHAR(40) NOT NULL, short VARCHAR(10) NOT NULL,
   vendor VARCHAR(80) NOT NULL, role VARCHAR(40) NOT NULL,
   start_min INT NOT NULL, dur INT NOT NULL, gap INT NOT NULL, flags TEXT NOT NULL)$ENGINE",
"CREATE TABLE workers (
   id INT PRIMARY KEY, service_id INT NOT NULL, name VARCHAR(40) NOT NULL, phone VARCHAR(20), emd VARCHAR(10),
   active INT NOT NULL DEFAULT 1, demo_slack REAL NOT NULL DEFAULT 0)$ENGINE",
"CREATE TABLE recipients (
   id INT PRIMARY KEY, code VARCHAR(20) NOT NULL UNIQUE, name VARCHAR(40) NOT NULL, sex VARCHAR(2) NOT NULL, age INT NOT NULL,
   emd VARCHAR(10) NOT NULL, household INT NOT NULL, phone VARCHAR(20), status VARCHAR(10) NOT NULL DEFAULT 'active',
   demo_risk REAL NOT NULL DEFAULT 0, demo_trend INT NOT NULL DEFAULT 0)$ENGINE",
"CREATE TABLE enrollments (
   id INT PRIMARY KEY, recipient_id INT NOT NULL, service_id INT NOT NULL, worker_id INT NOT NULL,
   rule TEXT NOT NULL, start_date VARCHAR(10) NOT NULL, end_date VARCHAR(10))$ENGINE",
"CREATE TABLE schedules (
   id $AI, date VARCHAR(10) NOT NULL, enrollment_id INT NOT NULL, recipient_id INT NOT NULL, service_id INT NOT NULL,
   worker_id INT NOT NULL, planned_min INT NOT NULL, duration INT NOT NULL)$ENGINE",
"CREATE UNIQUE INDEX ux_sched ON schedules (date, enrollment_id)",
"CREATE INDEX ix_sched_r ON schedules (recipient_id, date)",
"CREATE INDEX ix_sched_w ON schedules (worker_id, date)",
"CREATE TABLE visits (
   id $AI, schedule_id INT NOT NULL UNIQUE, status VARCHAR(10) NOT NULL,
   started_at VARCHAR(19), ended_at VARCHAR(19), health INT, flags TEXT, note TEXT, cancel_reason VARCHAR(40),
   source VARCHAR(10) NOT NULL DEFAULT 'app', lat REAL, lng REAL)$ENGINE",
"CREATE TABLE care_cases (
   recipient_id INT PRIMARY KEY, status VARCHAR(20) NOT NULL, memo TEXT, manual INT NOT NULL DEFAULT 0, updated_at VARCHAR(19))$ENGINE",
"CREATE TABLE reports (
   id $AI, created_at VARCHAR(19) NOT NULL, reporter VARCHAR(80), name VARCHAR(40) NOT NULL, age VARCHAR(5),
   emd VARCHAR(10), needs TEXT, reason TEXT, status VARCHAR(20) NOT NULL DEFAULT '접수')$ENGINE",
"CREATE TABLE users (
   id $AI, login_id VARCHAR(40) NOT NULL UNIQUE, pw_hash VARCHAR(255) NOT NULL, name VARCHAR(40) NOT NULL, phone VARCHAR(20),
   role VARCHAR(10) NOT NULL, org_id INT, worker_id INT, active INT NOT NULL DEFAULT 1, must_change INT NOT NULL DEFAULT 0,
   fail_count INT NOT NULL DEFAULT 0, locked_until VARCHAR(19), last_login VARCHAR(19), created_at VARCHAR(19), created_by INT)$ENGINE",
"CREATE TABLE audit_logs (
   id $AI, at VARCHAR(19) NOT NULL, user_id INT, login_id VARCHAR(40), action VARCHAR(30) NOT NULL,
   target VARCHAR(100), detail TEXT, ip VARCHAR(45))$ENGINE",
"CREATE INDEX ix_audit_at ON audit_logs (at)",
"CREATE TABLE plans (
   org_id INT NOT NULL, ym VARCHAR(7) NOT NULL, status VARCHAR(10) NOT NULL, note TEXT,
   submitted_at VARCHAR(19), submitted_by INT, decided_at VARCHAR(19), decided_by INT, PRIMARY KEY (org_id, ym))$ENGINE",
"CREATE TABLE change_requests (
   id $AI, schedule_id INT NOT NULL, requested_by INT, requested_at VARCHAR(19) NOT NULL, new_date VARCHAR(10) NOT NULL, new_min INT NOT NULL,
   reason TEXT, status VARCHAR(10) NOT NULL DEFAULT '대기', decided_by INT, decided_at VARCHAR(19), note TEXT)$ENGINE",
"CREATE TABLE emergencies (
   id $AI, at VARCHAR(19) NOT NULL, user_id INT, recipient_id INT NOT NULL, schedule_id INT, kind VARCHAR(30) NOT NULL, note TEXT,
   status VARCHAR(10) NOT NULL DEFAULT '접수', handled_by INT, handled_at VARCHAR(19), memo TEXT)$ENGINE",
];
foreach ($ddl as $s) db()->exec($s);
say('테이블 생성 완료');

/* ---------- 2. 서비스 7종 ---------- */
$SV = [
    [1, 'bath', '목욕', '목욕', '진도행복재가센터', '요양보호사', 540, 60, 30, ['피부 발적', '거동 불편', '통증 호소'], .24],
    [2, 'house', '가사', '가사', '진도가사돌봄협동조합', '가사관리사', 540, 90, 15, ['기운 없음', '식사량 저하', '우울감 호소', '집안 위생 악화'], .38],
    [3, 'meal', '식사(도시락)', '식사', '진도나눔도시락', '배달원', 630, 5, 12, ['지난 도시락 남김', '응답 지연', '식사량 저하'], .45],
    [4, 'beauty', '미용', '미용', '진도이·미용봉사단', '미용사', 600, 40, 20, ['기운 없음', '어지럼 호소'], .15],
    [5, 'move', '이동', '이동', '진도이동지원센터', '이동지원 기사', 540, 90, 30, ['거동 불편', '통증 호소'], .18],
    [6, 'smart', '스마트돌봄', '스마트', '진도스마트케어센터', '관제요원', 540, 3, 2, ['장시간 무활동', '야간 활동 이상'], .35],
    [7, 'medical', '방문의료', '의료', '진도방문의료협력의원', '방문간호사', 600, 40, 30, ['혈압 상승', '혈당 이상', '복약 미이행'], .24],
];
$rows = [];
foreach ($SV as $s) $rows[] = [$s[0], $s[1], $s[2], $s[3], $s[4], $s[5], $s[6], $s[7], $s[8], json_encode($s[9], JSON_UNESCAPED_UNICODE)];
batch_insert('services', ['id', 'code', 'name', 'short', 'vendor', 'role', 'start_min', 'dur', 'gap', 'flags'], $rows);

/* ---------- 3. 수혜자 600명 (가상) ---------- */
mt_srand(20261110);
$rnd = fn() => mt_rand() / mt_getrandmax();
$pick = fn(array $a) => $a[mt_rand(0, count($a) - 1)];
$SUR = ['김', '김', '김', '이', '이', '박', '박', '박', '최', '정', '조', '강', '윤', '장', '임', '한', '오', '서', '신', '권', '허', '곽', '문', '양'];
$GF = ['순', '자', '례', '덕', '님', '엽', '분', '옥', '단', '금', '심', '녀', '희', '애', '임'];
$GM = ['수', '철', '석', '남', '길', '동', '식', '봉', '환', '배', '용', '춘'];
$WN = ['희', '정', '숙', '영', '미', '경', '진', '선', '연', '현', '호', '민'];
$EMDW = [.34, .11, .10, .13, .13, .10, .09];
$year = (int)date('Y');
$y0 = "$year-01-01";
$y1 = "$year-12-31";

$recips = [];
$enrolls = [];
for ($i = 1; $i <= 600; $i++) {
    $sex = $rnd() < .68 ? '여' : '남';
    $name = $pick($SUR) . '○' . ($sex === '여' ? $pick($GF) : $pick($GM));
    $age = min(99, 65 + (int)floor($rnd() * 14 + pow($rnd(), .8) * 20));
    $x = $rnd(); $acc = 0; $e = 6;
    foreach ($EMDW as $k => $w) { $acc += $w; if ($x < $acc) { $e = $k; break; } }
    $hv = $rnd();
    $house = $hv < .58 ? 0 : ($hv < .88 ? 1 : 2);
    $rv = $rnd();
    $risk = $rv < .88 ? .02 : ($rv < .97 ? .07 : .2);
    $trend = ($risk > .15 || ($risk > .06 && $rnd() < .45)) ? 1 : 0;
    $recips[$i] = ['id' => $i, 'code' => 'JD-' . (1000 + $i), 'name' => $name, 'sex' => $sex, 'age' => $age, 'e' => $e, 'house' => $house, 'risk' => $risk, 'trend' => $trend];
    $mine = [];
    foreach ($SV as $s) {
        $p = $s[10];
        if ($age >= 85 && in_array($s[1], ['bath', 'medical'])) $p *= 1.45;
        if ($age >= 85 && $s[1] === 'move') $p *= 1.2;
        if ($house === 0 && in_array($s[1], ['meal', 'smart'])) $p *= 1.25;
        if ($rnd() < $p) $mine[] = $s;
    }
    if (!$mine) $mine[] = $rnd() < .6 ? $SV[2] : $SV[1];
    foreach ($mine as $s) {
        $wd1 = 1 + mt_rand(0, 4);
        $wd2 = (($wd1 - 1 + 2 + mt_rand(0, 1)) % 5) + 1;
        switch ($s[1]) {
            case 'bath':   $rule = ['type' => 'weekly', 'days' => [$wd1]]; break;
            case 'house':  $d = [$wd1, $wd2]; sort($d); $rule = ['type' => 'weekly', 'days' => $d]; break;
            case 'meal':   $rule = $rnd() < .2 ? ['type' => 'weekly', 'days' => [1, 3, 5]] : ['type' => 'weekdays']; break;
            case 'beauty': $rule = ['type' => 'monthly', 'days' => [$wd1], 'weeks' => [mt_rand(1, 4)]]; break;
            case 'smart':  $rule = ['type' => 'daily']; break;
            default:       $wk = mt_rand(1, 2); $rule = ['type' => 'monthly', 'days' => [$wd1], 'weeks' => [$wk, $wk + 2]];
        }
        $start = $rnd() < .82 ? $y0 : date('Y-m-d', strtotime("$y0 +" . mt_rand(1, 299) . ' day'));
        $enrolls[] = ['r' => $i, 's' => $s[0], 'e' => $e, 'rule' => $rule, 'start' => $start];
    }
}
$rows = [];
foreach ($recips as $r) $rows[] = [$r['id'], $r['code'], $r['name'], $r['sex'], $r['age'], EMD[$r['e']], $r['house'], 'active', $r['risk'], $r['trend']];
batch_insert('recipients', ['id', 'code', 'name', 'sex', 'age', 'emd', 'household', 'status', 'demo_risk', 'demo_trend'], $rows);
say('수혜자 600명 등록');

/* ---------- 4. 담당자 210명: 서비스별 30명, 읍·면 순으로 대상자 배정 ---------- */
$wrows = [];
$erows = [];
$wid = 0;
$eid = 0;
foreach ($SV as $s) {
    $list = array_values(array_filter($enrolls, fn($x) => $x['s'] === $s[0]));
    usort($list, fn($a, $b) => $a['e'] <=> $b['e'] ?: $a['r'] <=> $b['r']);
    $per = (int)ceil(count($list) / 30);
    for ($k = 0; $k < 30; $k++) {
        $wid++;
        $chunk = array_slice($list, $k * $per, $per);
        $wrows[] = [$wid, $s[0], $pick($SUR) . '○' . $pick($WN), '010-0000-' . sprintf('%04d', $wid), $chunk ? EMD[$chunk[0]['e']] : EMD[0], pow($rnd(), 3)];
        foreach ($chunk as $en) {
            $eid++;
            $erows[] = [$eid, $en['r'], $s[0], $wid, json_encode($en['rule']), $en['start'], null];
        }
    }
}
batch_insert('workers', ['id', 'service_id', 'name', 'phone', 'emd', 'demo_slack'], $wrows);
batch_insert('enrollments', ['id', 'recipient_id', 'service_id', 'worker_id', 'rule', 'start_date', 'end_date'], $erows);
say("담당자 {$wid}명, 서비스 이용 {$eid}건 등록");

/* ---------- 5. 올해 방문 일정 ---------- */
// 올해 전체 + 다음 달 말까지 (12월에 설치해도 다음 달 계획 화면이 비지 않도록)
$genTo = max($y1, date('Y-m-t', strtotime(date('Y-m-01') . ' +1 month')));
db()->beginTransaction();
$n = generate_schedules($y0, $genTo);
db()->commit();
say("방문 일정 {$n}건 생성 ($y0 ~ $genTo)");

/* ---------- 6. 발굴신고 예시 ---------- */
$today = today();
$rep = [
    [0, '박○희 (배달원)', '정○례', '81', '의신면', ['식사', '스마트돌봄'], '도시락 배달 중 옆집 어르신이 며칠째 끼니를 거르신다고 이웃이 알려줌. 독거.', '접수'],
    [1, '김○정 (가사관리사)', '김○수', '77', '진도읍', ['가사', '방문의료'], '가사 서비스 중 이웃 어르신 댁 방문. 집안 위생 상태가 나쁘고 거동이 불편해 보임.', '현장확인'],
    [3, '신○선 (관제요원)', '박○님', '86', '조도면', ['이동', '방문의료'], '조도면 거주. 정기 통원이 필요하나 배편 이동이 어려워 진료를 미루고 있음.', '서비스연계'],
    [5, '오○연 (요양보호사)', '이○자', '79', '임회면', ['목욕', '식사'], '목욕 서비스 대상자 가족이 이웃 어르신도 혼자 씻기 어렵다고 알려줌.', '접수'],
    [9, '한○정 (방문간호사)', '최○식', '83', '군내면', ['스마트돌봄'], '방문간호 중 확인. 야간에 혼자 넘어진 적이 있어 응급호출 장비 필요.', '종결'],
];
$rows = [];
foreach ($rep as $r) $rows[] = [add_days($today, -$r[0]) . ' 10:00:00', $r[1], $r[2], $r[3], $r[4], json_encode($r[5], JSON_UNESCAPED_UNICODE), $r[6], $r[7]];
batch_insert('reports', ['created_at', 'reporter', 'name', 'age', 'emd', 'needs', 'reason', 'status'], $rows);

/* ---------- 7. 데모 수행기록 (1월 1일 ~ 지금) ---------- */
if (cfg('DEMO_MODE')) {
    say('지난 수행기록을 만드는 중입니다 (1~2분 걸릴 수 있음)...');
    demo_tick($y0);
    $c = q('SELECT COUNT(*) c FROM visits')->fetch()['c'];
    say("수행기록 {$c}건 생성");
}
/* ---------- 8. 계정 (모두 같은 데모 비밀번호) ---------- */
$hash = password_hash(DEMO_PASSWORD, PASSWORD_DEFAULT);
$now = date('Y-m-d H:i:s');
$urows = [
    ['admin', $hash, '군 전산 담당', '010-0000-0001', 'admin', null, null, $now],
    ['central', $hash, '통합돌봄 총괄 담당', '010-0000-0002', 'central', null, null, $now],
    ['viewer', $hash, '보건소 조회 담당', '010-0000-0003', 'viewer', null, null, $now],
];
foreach ($SV as $s) $urows[] = ['org' . $s[0], $hash, $s[4] . ' 관리자', '010-0000-01' . sprintf('%02d', $s[0]), 'org', $s[0], null, $now];
foreach (q('SELECT id, service_id, name, phone FROM workers ORDER BY id')->fetchAll() as $w) {
    $urows[] = ['w' . sprintf('%03d', $w['id']), $hash, $w['name'], $w['phone'], 'worker', (int)$w['service_id'], (int)$w['id'], $now];
}
batch_insert('users', ['login_id', 'pw_hash', 'name', 'phone', 'role', 'org_id', 'worker_id', 'created_at'], $urows);
say('계정 ' . count($urows) . '개 생성 (비밀번호 ' . DEMO_PASSWORD . ')');

/* ---------- 9. 월간 계획 상태: 이번 달까지 승인, 다음 달은 기관별로 다르게 ---------- */
$curYm = date('Y-m');
$nextYm = date('Y-m', strtotime(date('Y-m-01') . ' +1 month'));
$central = (int)q("SELECT id FROM users WHERE login_id='central'")->fetch()['id'];
$prows = [];
for ($m = 1; $m <= 12; $m++) {
    $ym = sprintf('%04d-%02d', $year, $m);
    if ($ym > $curYm) break;
    foreach ($SV as $s) $prows[] = [$s[0], $ym, '승인', null, "$ym-01 09:00:00", null, "$ym-01 10:00:00", $central];
}
$nextState = [1 => '제출', 2 => '작성중', 3 => '제출', 4 => '반려', 5 => '작성중', 6 => '승인', 7 => '제출'];
foreach ($SV as $s) {
    $st = $nextState[$s[0]];
    $prows[] = [$s[0], $nextYm, $st, $st === '반려' ? '셋째 주 화요일 일정이 빠진 어르신이 있습니다. 확인 후 다시 제출해 주세요.' : null,
        $st === '작성중' ? null : date('Y-m-d H:i:s', strtotime('-1 day')), null, in_array($st, ['승인', '반려'], true) ? $now : null, in_array($st, ['승인', '반려'], true) ? $central : null];
}
batch_insert('plans', ['org_id', 'ym', 'status', 'note', 'submitted_at', 'submitted_by', 'decided_at', 'decided_by'], $prows);

/* ---------- 10. 변경 요청·긴급 예시 ---------- */
$tomorrow = add_days($today, 1);
$crow = [];
foreach (q('SELECT s.id, s.date, s.planned_min, s.worker_id FROM schedules s WHERE s.date BETWEEN ? AND ? AND s.service_id IN (1, 2) ORDER BY s.id LIMIT 2', [$tomorrow, add_days($today, 7)])->fetchAll() as $i => $s) {
    $u = q('SELECT id FROM users WHERE worker_id = ?', [$s['worker_id']])->fetch();
    $crow[] = [(int)$s['id'], $u ? (int)$u['id'] : null, $now, add_days($s['date'], 1), (int)$s['planned_min'] + 60,
        $i === 0 ? '어르신 병원 정기 진료와 겹친다고 하셔서 다음 날로 옮기고 싶습니다.' : '어르신 요청으로 한 시간 늦게 방문하려고 합니다.'];
}
batch_insert('change_requests', ['schedule_id', 'requested_by', 'requested_at', 'new_date', 'new_min', 'reason'], $crow);
if (cfg('DEMO_MODE')) {
    $s = q("SELECT s.id, s.recipient_id, s.worker_id FROM schedules s WHERE s.date = ? AND s.service_id = 2 ORDER BY s.planned_min LIMIT 1", [$today])->fetch();
    if ($s) {
        $u = q('SELECT id FROM users WHERE worker_id = ?', [$s['worker_id']])->fetch();
        q('INSERT INTO emergencies (at, user_id, recipient_id, schedule_id, kind, note, status) VALUES (?,?,?,?,?,?,?)',
          [date('Y-m-d H:i:s', time() - 600), $u ? $u['id'] : null, $s['recipient_id'], $s['id'], '응답 없음', '방문했으나 문이 잠겨 있고 응답이 없습니다. 보호자에게 연락 중입니다.', '접수']);
    }
}

kv_set('installed_at', date('Y-m-d H:i:s'));
say(sprintf('설치 완료 (%.1f초). index.php(대시보드)와 field.php(현장 앱)를 열어 보세요. 이 install.php는 삭제하세요.', microtime(true) - $t0));
