<?php
/**
 * JSON API — 모든 요청은 로그인이 필요하며, 역할에 따라 볼 수 있는 범위가 정해집니다.
 *
 * 역할: admin 시스템 관리자 · central 총괄 담당자 · org 수행기관 관리자(자기 서비스만) · worker 현장 수행자(자기 일정만) · viewer 조회 전용
 *
 * [조회]   me, meta, year, month, day, recipient, care, alerts, plans, plan_day, change_requests, users, audit, field
 * [현장]   visit_start, visit_end, visit_cancel, emergency, change_request, report
 * [계획]   plan_draft, plan_submit, plan_decide, schedule_update, schedule_delete, schedule_add, bulk_move, bulk_transfer, change_decide
 * [관리]   care, report_status, emergency_handle, user_create, user_update, my_password
 *
 * POST 요청은 JSON 본문 + 'X-Requested-With: fetch' 헤더가 있어야 합니다(다른 사이트에서 보낸 요청 차단).
 */
declare(strict_types=1);
require __DIR__ . '/lib/core.php';

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

function out($data, int $code = 200): void
{
    http_response_code($code);
    echo json_encode($data, JSON_UNESCAPED_UNICODE);
    exit;
}
function fail(string $msg, int $code = 400): void
{
    out(['error' => $msg], $code);
}
function body(): array
{
    $j = json_decode(file_get_contents('php://input') ?: '[]', true);
    return is_array($j) ? $j : [];
}
function need(string ...$roles): void
{
    if (!is_role(...$roles)) fail('이 기능을 쓸 권한이 없습니다.', 403);
}
function valid_date(?string $d): string
{
    return ($d && preg_match('/^\d{4}-\d{2}-\d{2}$/', $d)) ? $d : today();
}
function valid_ym(?string $ym): string
{
    return ($ym && preg_match('/^\d{4}-\d{2}$/', $ym)) ? $ym : date('Y-m', strtotime(date('Y-m-01') . ' +1 month'));
}
function parse_hm(?string $s): ?int
{
    if (!$s || !preg_match('/^(\d{1,2}):(\d{2})$/', $s, $m)) return null;
    $v = (int)$m[1] * 60 + (int)$m[2];
    return ($v >= 0 && $v < 1440) ? $v : null;
}
function zero7(): array
{
    $a = [];
    foreach (visible_services() as $id => $_) $a[$id] = ['plan' => 0, 'done' => 0, 'prog' => 0, 'late' => 0, 'miss' => 0, 'cancel' => 0, 'bad' => 0];
    return $a;
}
function visible_services(): array
{
    $sid = scope_sid();
    return $sid ? [$sid => services()[$sid]] : services();
}
/** SQL 조각: 수행기관 관리자면 자기 서비스로 제한 */
function scope_where(string $alias = 's'): array
{
    $sid = scope_sid();
    return $sid ? [" AND $alias.service_id = ?", [$sid]] : ['', []];
}
function user_brief(array $u): array
{
    return ['id' => (int)$u['id'], 'login_id' => $u['login_id'], 'name' => $u['name'], 'role' => $u['role'], 'role_label' => ROLE_LABEL[$u['role']] ?? $u['role'],
            'org_id' => $u['org_id'] === null ? null : (int)$u['org_id'], 'org_name' => $u['vendor'] ?? null, 'service' => $u['sshort'] ?? null,
            'worker_id' => $u['worker_id'] === null ? null : (int)$u['worker_id'], 'must_change' => (int)$u['must_change'] === 1];
}
/** 수행기관 관리자가 다루는 일정인지 확인하고 일정 행을 돌려줌 */
function own_schedule(int $id): array
{
    $s = q('SELECT * FROM schedules WHERE id = ?', [$id])->fetch();
    if (!$s) fail('일정을 찾을 수 없습니다.', 404);
    $sid = scope_sid();
    if ($sid && (int)$s['service_id'] !== $sid) fail('다른 기관의 일정입니다.', 403);
    return $s;
}

try {
    $a = $_GET['a'] ?? '';
    $method = $_SERVER['REQUEST_METHOD'];
    $me = current_user();
    if (!$me) fail('로그인이 필요합니다. 다시 로그인해 주세요.', 401);
    if ($method === 'POST' && ($_SERVER['HTTP_X_REQUESTED_WITH'] ?? '') !== 'fetch') fail('잘못된 요청입니다.', 400);
    if ($method === 'GET') demo_tick();
    $today = today();
    $now = now_min();
    $uid = (int)$me['id'];
    $DASH = ['admin', 'central', 'viewer', 'org'];

    switch ("$method $a") {

    /* ================= 조회 ================= */
    case 'GET me':
        out(['user' => user_brief($me), 'today' => $today, 'now' => $now, 'demo' => cfg('DEMO_MODE')]);

    case 'GET meta':
        need(...$DASH);
        $sid = scope_sid();
        $sv = array_values(array_map(fn($s) => [
            'id' => (int)$s['id'], 'code' => $s['code'], 'name' => $s['name'], 'short' => $s['short'],
            'vendor' => $s['vendor'], 'role' => $s['role'], 'flags' => $s['flags']], visible_services()));
        $en = [];
        foreach (q('SELECT * FROM enrollments' . ($sid ? ' WHERE service_id = ?' : '') . ' ORDER BY service_id', $sid ? [$sid] : []) as $e) {
            $en[(int)$e['recipient_id']][] = ['id' => (int)$e['id'], 'sid' => (int)$e['service_id'], 'wid' => (int)$e['worker_id'],
                'text' => rule_text(json_decode($e['rule'], true)), 'start' => $e['start_date']];
        }
        $rs = [];
        foreach (q("SELECT id, code, name, sex, age, emd, household FROM recipients WHERE status='active' ORDER BY id") as $r) {
            if ($sid && !isset($en[(int)$r['id']])) continue;
            $rs[] = ['id' => (int)$r['id'], 'code' => $r['code'], 'name' => $r['name'], 'sex' => $r['sex'], 'age' => (int)$r['age'],
                'e' => array_search($r['emd'], EMD, true), 'house' => (int)$r['household'], 'en' => $en[(int)$r['id']] ?? []];
        }
        $ws = q('SELECT w.id, w.service_id, w.name, w.emd, w.active, COUNT(e.id) n FROM workers w LEFT JOIN enrollments e ON e.worker_id = w.id'
                . ($sid ? ' WHERE w.service_id = ?' : '') . ' GROUP BY w.id, w.service_id, w.name, w.emd, w.active ORDER BY w.id', $sid ? [$sid] : [])->fetchAll();
        $ws = array_map(fn($w) => ['id' => (int)$w['id'], 'sid' => (int)$w['service_id'], 'name' => $w['name'], 'active' => (int)$w['active'] === 1,
            'e' => (int)array_search($w['emd'], EMD, true), 'n' => (int)$w['n']], $ws);
        out(['services' => $sv, 'emd' => EMD, 'house' => HOUSE, 'recipients' => $rs, 'workers' => $ws,
            'today' => $today, 'now' => $now, 'demo' => cfg('DEMO_MODE'), 'risk_rule' => cfg('RISK')]);

    case 'GET year':
        need(...$DASH);
        $y = (int)($_GET['y'] ?? date('Y'));
        $y0 = "$y-01-01"; $y1 = "$y-12-31";
        [$sw, $sp] = scope_where();
        $rows = q("SELECT SUBSTR(s.date,6,2) AS m, s.service_id AS sid,
                     COUNT(*) AS plan,
                     SUM(CASE WHEN s.date < ? THEN 1 ELSE 0 END) AS pplan,
                     SUM(CASE WHEN s.date < ? AND v.status='cancel' THEN 1 ELSE 0 END) AS cancel,
                     SUM(CASE WHEN s.date < ? AND v.ended_at IS NOT NULL THEN 1 ELSE 0 END) AS pdone,
                     SUM(CASE WHEN s.date <= ? AND v.ended_at IS NOT NULL THEN 1 ELSE 0 END) AS done,
                     SUM(CASE WHEN s.date < ? AND (v.id IS NULL OR (v.status <> 'cancel' AND v.ended_at IS NULL)) THEN 1 ELSE 0 END) AS miss
                   FROM schedules s LEFT JOIN visits v ON v.schedule_id = s.id
                   WHERE s.date BETWEEN ? AND ? $sw GROUP BY SUBSTR(s.date,6,2), s.service_id",
                   array_merge([$today, $today, $today, $today, $today, $y0, $y1], $sp))->fetchAll();
        $months = [];
        for ($m = 1; $m <= 12; $m++) foreach (visible_services() as $sid => $_) $months[$m][$sid] = ['plan' => 0, 'pplan' => 0, 'cancel' => 0, 'pdone' => 0, 'done' => 0, 'miss' => 0];
        foreach ($rows as $r) foreach (['plan', 'pplan', 'cancel', 'pdone', 'done', 'miss'] as $k) $months[(int)$r['m']][(int)$r['sid']][$k] = (int)$r[$k];
        $emd = array_fill_keys(EMD, 0);
        foreach (q("SELECT r.emd, COUNT(*) c FROM schedules s JOIN visits v ON v.schedule_id=s.id JOIN recipients r ON r.id=s.recipient_id
                    WHERE s.date BETWEEN ? AND ? AND v.ended_at IS NOT NULL $sw GROUP BY r.emd", array_merge([$y0, min($y1, $today)], $sp)) as $r) $emd[$r['emd']] = (int)$r['c'];
        [$ew, $ep] = scope_where('e');
        $users = [];
        foreach (q("SELECT e.service_id, COUNT(*) c FROM enrollments e WHERE e.start_date <= ? $ew GROUP BY e.service_id", array_merge([$today], $ep)) as $r) $users[(int)$r['service_id']] = (int)$r['c'];
        $multi = (int)q('SELECT COUNT(*) c FROM (SELECT recipient_id FROM enrollments GROUP BY recipient_id HAVING COUNT(*) >= 2) t')->fetch()['c'];
        $nrec = (int)q("SELECT COUNT(DISTINCT e.recipient_id) c FROM enrollments e JOIN recipients r ON r.id=e.recipient_id WHERE r.status='active' $ew", $ep)->fetch()['c'];
        $nw = (int)q('SELECT COUNT(*) c FROM workers w WHERE w.active=1' . (scope_sid() ? ' AND w.service_id = ?' : ''), $ep)->fetch()['c'];
        out(['year' => $y, 'months' => $months, 'emd' => $emd, 'users' => $users ?: new stdClass(), 'multi' => $multi,
             'recipients' => $nrec, 'workers' => $nw, 'now' => $now, 'today' => $today]);

    case 'GET month':
        need(...$DASH);
        $y = (int)($_GET['y'] ?? date('Y'));
        $m = (int)($_GET['m'] ?? date('n'));
        $from = sprintf('%04d-%02d-01', $y, $m);
        $to = date('Y-m-t', strtotime($from));
        [$sw, $sp] = scope_where();
        $days = [];
        $wg = [];
        $person = [];
        $svc = isset($_GET['svc']) ? (int)$_GET['svc'] : null;
        $rid = isset($_GET['rid']) ? (int)$_GET['rid'] : null;
        foreach (fetch_schedules($from, $to, $sw, $sp) as $r) {
            $st = status_of($r, $today, $now);
            $d = $r['date'];
            $sid = (int)$r['service_id'];
            if (!isset($days[$d])) $days[$d] = zero7();
            $days[$d][$sid]['plan']++;
            if ($st !== 'plan') $days[$d][$sid][$st]++;
            if ($st === 'done' && (int)$r['health'] === 2) $days[$d][$sid]['bad']++;
            if ($svc && $sid === $svc) {
                $k = $r['worker_id'] . '_' . $d;
                $wg[$k] = $wg[$k] ?? ['n' => 0, 'miss' => 0, 'late' => 0];
                $wg[$k]['n']++;
                if ($st === 'miss') $wg[$k]['miss']++;
                if ($st === 'late') $wg[$k]['late']++;
            }
            if ($rid && (int)$r['recipient_id'] === $rid) $person[] = rec_out($r, $today, $now);
        }
        $ym = substr($from, 0, 7);
        $nym = date('Y-m', strtotime("$from +1 month"));
        $plans = [];
        foreach (visible_services() as $sid => $_) $plans[$sid] = ['this' => plan_status($sid, $ym)['status'], 'next' => plan_status($sid, $nym)['status']];
        out(['from' => $from, 'to' => $to, 'days' => $days ?: new stdClass(), 'workers' => $wg ?: new stdClass(), 'person' => $person,
             'plans' => $plans, 'next_ym' => $nym, 'now' => $now, 'today' => $today]);

    case 'GET day':
        need(...$DASH);
        $d = valid_date($_GET['date'] ?? null);
        [$sw, $sp] = scope_where();
        $recs = array_map(fn($r) => rec_out($r, $today, $now), fetch_schedules($d, $d, $sw, $sp));
        $risk = array_filter(compute_risk(scope_sid()), fn($o) => $o['level'] > 0);
        out(['date' => $d, 'recs' => $recs, 'risk' => $risk ?: new stdClass(), 'now' => $now, 'today' => $today]);

    case 'GET recipient':
        need(...$DASH);
        $id = (int)($_GET['id'] ?? 0);
        $d = valid_date($_GET['date'] ?? null);
        $r = q('SELECT * FROM recipients WHERE id=?', [$id])->fetch();
        if (!$r) fail('수혜자를 찾을 수 없습니다.', 404);
        $sid = scope_sid();
        if ($sid && !q('SELECT 1 FROM enrollments WHERE recipient_id=? AND service_id=?', [$id, $sid])->fetch()) fail('우리 기관이 담당하지 않는 수혜자입니다.', 403);
        audit('view_recipient', $r['code'], $r['name']);
        [$sw, $sp] = scope_where();
        $from = add_days($today, -29);
        $grid = [];
        $notes = [];
        foreach (fetch_schedules($from, $today, "AND s.recipient_id = ? $sw", array_merge([$id], $sp)) as $x) {
            $o = rec_out($x, $today, $now);
            $grid[(int)$x['service_id']][$x['date']] = ['st' => $o['st'], 'h' => $o['h']];
            if ($o['st'] === 'done' && $o['h'] === 2) $notes[] = $o;
        }
        $recs = array_map(fn($x) => rec_out($x, $today, $now), fetch_schedules($d, $d, "AND s.recipient_id = ? $sw", array_merge([$id], $sp)));
        $risk = compute_risk($sid)[$id] ?? ['score' => 0, 'level' => 0, 'reasons' => []];
        $care = $sid ? null : (q('SELECT * FROM care_cases WHERE recipient_id=?', [$id])->fetch() ?: null);
        out(['id' => $id, 'date' => $d, 'from' => $from, 'recs' => $recs, 'grid' => $grid ?: new stdClass(),
             'notes' => array_slice(array_reverse($notes), 0, 8), 'risk' => $risk, 'care' => $care, 'today' => $today, 'now' => $now]);

    case 'GET care':
        need('admin', 'central', 'viewer');
        $risk = compute_risk();
        $cases = [];
        foreach (q('SELECT * FROM care_cases') as $c) $cases[(int)$c['recipient_id']] = $c;
        $list = [];
        foreach ($risk as $id => $o) if ($o['level'] >= 2 || isset($cases[$id])) $list[] = ['rid' => $id] + $o + ['care' => $cases[$id] ?? null];
        usort($list, fn($x, $y) => $y['score'] <=> $x['score']);
        $cnt = [1 => 0, 2 => 0, 3 => 0];
        foreach ($risk as $o) if ($o['level']) $cnt[$o['level']]++;
        $reports = q('SELECT * FROM reports ORDER BY created_at DESC, id DESC')->fetchAll();
        foreach ($reports as &$p) $p['needs'] = json_decode($p['needs'] ?: '[]', true);
        unset($p);
        out(['list' => $list, 'counts' => $cnt, 'manual' => count(array_filter($cases, fn($c) => (int)$c['manual'] === 1)), 'reports' => $reports]);

    /** 상단 알림 띠와 탭 숫자: 긴급, 승인 대기, 변경 요청 */
    case 'GET alerts':
        need(...$DASH);
        $sid = scope_sid();
        $em = q("SELECT m.*, r.name AS rname, r.emd, r.code, u.name AS uname, s.service_id
                 FROM emergencies m JOIN recipients r ON r.id = m.recipient_id LEFT JOIN users u ON u.id = m.user_id
                 LEFT JOIN schedules s ON s.id = m.schedule_id
                 WHERE m.status <> '조치완료'" . ($sid ? ' AND s.service_id = ?' : '') . ' ORDER BY m.at DESC', $sid ? [$sid] : [])->fetchAll();
        $nym = date('Y-m', strtotime(date('Y-m-01') . ' +1 month'));
        $pending = (int)q("SELECT COUNT(*) c FROM plans WHERE status = '제출'")->fetch()['c'];
        $cr = (int)q("SELECT COUNT(*) c FROM change_requests c JOIN schedules s ON s.id = c.schedule_id WHERE c.status = '대기'" . ($sid ? ' AND s.service_id = ?' : ''), $sid ? [$sid] : [])->fetch()['c'];
        $mine = $sid ? plan_status($sid, $nym) : null;
        out(['emergencies' => $em, 'pending_plans' => $pending, 'change_requests' => $cr, 'my_plan' => $mine, 'next_ym' => $nym, 'now' => $now, 'today' => $today]);

    /** 월간 계획 상태 + 자동 점검 (총괄: 7개 기관 / 수행기관: 자기 기관) */
    case 'GET plans':
        need(...$DASH);
        $ym = valid_ym($_GET['ym'] ?? null);
        $list = [];
        foreach (visible_services() as $sid => $s) {
            $p = plan_status($sid, $ym);
            $chk = plan_check($sid, $ym);
            $by = $p['submitted_by'] ? q('SELECT name FROM users WHERE id=?', [$p['submitted_by']])->fetch() : null;
            $list[] = ['sid' => $sid, 'service' => $s['name'], 'vendor' => $s['vendor'], 'status' => $p['status'], 'note' => $p['note'],
                'submitted_at' => $p['submitted_at'], 'submitted_by' => $by['name'] ?? null, 'decided_at' => $p['decided_at'],
                'total' => $chk['total'], 'shortfall' => $chk['shortfall'], 'overlaps' => $chk['overlaps'], 'sundays' => $chk['sundays']];
        }
        $deadline = date('Y-m-20', strtotime("$ym-01 -1 month"));
        out(['ym' => $ym, 'deadline' => $deadline, 'list' => $list, 'today' => $today]);

    /** 계획 화면: 한 담당자의 하루 일정 */
    case 'GET plan_day':
        need(...$DASH);
        $d = valid_date($_GET['date'] ?? null);
        $wid = (int)($_GET['wid'] ?? 0);
        [$sw, $sp] = scope_where();
        $rows = fetch_schedules($d, $d, "AND s.worker_id = ? $sw", array_merge([$wid], $sp));
        $out = [];
        foreach ($rows as $r) {
            $o = rec_out($r, $today, $now);
            $s = q('SELECT * FROM schedules WHERE id=?', [$o['id']])->fetch();
            $o['lock'] = schedule_lock_reason($s);
            $out[] = $o;
        }
        out(['date' => $d, 'wid' => $wid, 'recs' => $out, 'editable' => scope_sid() ? plan_editable(scope_sid(), ym_of($d)) : false]);

    case 'GET change_requests':
        need(...$DASH);
        [$sw, $sp] = scope_where();
        $rows = q("SELECT c.*, s.date, s.planned_min, s.service_id, s.worker_id, r.name AS rname, r.code, u.name AS uname, d.name AS dname
                   FROM change_requests c JOIN schedules s ON s.id = c.schedule_id JOIN recipients r ON r.id = s.recipient_id
                   LEFT JOIN users u ON u.id = c.requested_by LEFT JOIN users d ON d.id = c.decided_by
                   WHERE 1=1 $sw ORDER BY CASE WHEN c.status = '대기' THEN 0 ELSE 1 END, c.requested_at DESC", $sp)->fetchAll();
        out(['list' => array_slice($rows, 0, 100)]);

    case 'GET users':
        need('admin', 'central', 'org');
        $where = match ($me['role']) {
            'admin' => ['1=1', []],
            'central' => ["u.role IN ('org','viewer')", []],
            'org' => ["u.role = 'worker' AND u.org_id = ?", [(int)$me['org_id']]],
        };
        $rows = q("SELECT u.id, u.login_id, u.name, u.phone, u.role, u.org_id, u.worker_id, u.active, u.last_login, u.locked_until, s.short, w.emd,
                          (SELECT COUNT(*) FROM enrollments e WHERE e.worker_id = u.worker_id) AS n
                   FROM users u LEFT JOIN services s ON s.id = u.org_id LEFT JOIN workers w ON w.id = u.worker_id
                   WHERE {$where[0]} ORDER BY u.role, u.org_id, u.id", $where[1])->fetchAll();
        out(['list' => $rows, 'roles' => ROLE_LABEL]);

    case 'GET audit':
        need('admin');
        $p = [];
        $w = '1=1';
        if (!empty($_GET['q'])) { $w .= ' AND (login_id LIKE ? OR target LIKE ?)'; $p[] = '%' . $_GET['q'] . '%'; $p[] = '%' . $_GET['q'] . '%'; }
        if (!empty($_GET['action'])) { $w .= ' AND action = ?'; $p[] = $_GET['action']; }
        out(['list' => q("SELECT * FROM audit_logs WHERE $w ORDER BY id DESC LIMIT 300", $p)->fetchAll(),
             'actions' => array_column(q('SELECT DISTINCT action FROM audit_logs ORDER BY action')->fetchAll(), 'action')]);

    /* ================= 현장 앱 ================= */
    case 'GET field':
        need('worker');
        $wid = (int)$me['worker_id'];
        $d = valid_date($_GET['date'] ?? null);
        $w = q('SELECT w.*, s.name AS sname, s.role, s.flags FROM workers w JOIN services s ON s.id=w.service_id WHERE w.id=?', [$wid])->fetch();
        if (!$w) fail('담당자 정보가 없습니다. 기관 관리자에게 문의하세요.', 404);
        $rows = fetch_schedules($d, $d, 'AND s.worker_id = ?', [$wid]);
        $rs = [];
        foreach (q('SELECT r.id, r.name, r.age, r.sex, r.emd, r.household, r.phone FROM recipients r JOIN schedules s ON s.recipient_id=r.id WHERE s.worker_id=? AND s.date=?', [$wid, $d]) as $r) $rs[(int)$r['id']] = $r;
        $pend = [];
        foreach (q("SELECT schedule_id FROM change_requests WHERE status='대기' AND requested_by = ?", [$uid]) as $c) $pend[(int)$c['schedule_id']] = true;
        $recs = array_map(function ($x) use ($today, $now, $rs, $pend) {
            $o = rec_out($x, $today, $now);
            $o['who'] = $rs[$o['rid']] ?? null;
            $o['pending_change'] = isset($pend[$o['id']]);
            return $o;
        }, $rows);
        out(['worker' => ['id' => $wid, 'name' => $w['name'], 'service' => $w['sname'], 'sid' => (int)$w['service_id'], 'role' => $w['role'], 'flags' => json_decode($w['flags'], true)],
             'user' => user_brief($me), 'date' => $d, 'recs' => $recs, 'now' => $now, 'today' => $today]);

    case 'POST visit_start':
    case 'POST visit_end':
    case 'POST visit_cancel':
        need('worker');
        $b = body();
        $sid = (int)($b['schedule_id'] ?? 0);
        $s = q('SELECT * FROM schedules WHERE id=?', [$sid])->fetch();
        if (!$s) fail('일정을 찾을 수 없습니다.', 404);
        if ((int)$s['worker_id'] !== (int)$me['worker_id']) fail('내 일정이 아닙니다.', 403);
        if ($s['date'] !== $today) fail('오늘 일정만 기록할 수 있습니다.');
        $v = q('SELECT * FROM visits WHERE schedule_id=?', [$sid])->fetch();
        $ts = date('Y-m-d H:i:s');
        if ($a === 'visit_start') {
            if ($v) fail('이미 기록이 있습니다. 화면을 새로고침해 주세요.');
            q("INSERT INTO visits (schedule_id, status, started_at, source, lat, lng) VALUES (?, 'started', ?, 'app', ?, ?)",
              [$sid, $ts, isset($b['lat']) ? (float)$b['lat'] : null, isset($b['lng']) ? (float)$b['lng'] : null]);
        } elseif ($a === 'visit_end') {
            $h = (int)($b['health'] ?? -1);
            if ($h < 0 || $h > 2) fail('건강상태를 골라 주세요.');
            $flags = array_values(array_filter(array_map('strval', (array)($b['flags'] ?? []))));
            $fj = $flags ? json_encode($flags, JSON_UNESCAPED_UNICODE) : null;
            $note = mb_substr(trim((string)($b['note'] ?? '')), 0, 1000);
            if (!$v) {
                q("INSERT INTO visits (schedule_id, status, started_at, ended_at, health, flags, note, source) VALUES (?, 'done', ?, ?, ?, ?, ?, 'app')", [$sid, $ts, $ts, $h, $fj, $note ?: null]);
            } else {
                if ($v['status'] !== 'started') fail('진행 중인 방문이 아닙니다.');
                q("UPDATE visits SET status='done', ended_at=?, health=?, flags=?, note=? WHERE id=?", [$ts, $h, $fj, $note ?: null, $v['id']]);
            }
        } else {
            if ($v) fail('이미 기록이 있습니다.');
            $reason = mb_substr(trim((string)($b['reason'] ?? '')), 0, 40) ?: '기타';
            q("INSERT INTO visits (schedule_id, status, cancel_reason, source) VALUES (?, 'cancel', ?, 'app')", [$sid, $reason]);
        }
        audit($a, 'schedule#' . $sid, $a === 'visit_end' ? '건강 ' . ['좋음', '보통', '나쁨'][(int)($b['health'] ?? 0)] : '');
        out(['ok' => true]);

    case 'POST emergency':
        need('worker');
        $b = body();
        $s = q('SELECT * FROM schedules WHERE id=?', [(int)($b['schedule_id'] ?? 0)])->fetch();
        if (!$s || (int)$s['worker_id'] !== (int)$me['worker_id']) fail('내 일정에서만 긴급 상황을 알릴 수 있습니다.', 403);
        $kind = mb_substr(trim((string)($b['kind'] ?? '')), 0, 30) ?: '기타';
        q('INSERT INTO emergencies (at, user_id, recipient_id, schedule_id, kind, note, status) VALUES (?,?,?,?,?,?,?)',
          [date('Y-m-d H:i:s'), $uid, $s['recipient_id'], $s['id'], $kind, mb_substr(trim((string)($b['note'] ?? '')), 0, 1000), '접수']);
        audit('emergency', 'schedule#' . $s['id'], $kind);
        out(['ok' => true]);

    case 'POST emergency_handle':
        need('admin', 'central', 'org');
        $b = body();
        $id = (int)($b['id'] ?? 0);
        $m = q('SELECT m.*, s.service_id FROM emergencies m LEFT JOIN schedules s ON s.id = m.schedule_id WHERE m.id=?', [$id])->fetch();
        if (!$m) fail('긴급 건을 찾을 수 없습니다.', 404);
        if (scope_sid() && (int)$m['service_id'] !== scope_sid()) fail('다른 기관의 건입니다.', 403);
        $memo = trim((string)($b['memo'] ?? ''));
        if ($memo === '') fail('어떻게 조치했는지 적어 주세요.');
        $st = ($b['status'] ?? '') === '확인중' ? '확인중' : '조치완료';
        q('UPDATE emergencies SET status=?, handled_by=?, handled_at=?, memo=? WHERE id=?', [$st, $uid, date('Y-m-d H:i:s'), mb_substr($memo, 0, 1000), $id]);
        audit('emergency_handle', 'emergency#' . $id, "$st: $memo");
        out(['ok' => true]);

    /** 일정 변경 요청: 현장 수행자(자기 일정) 또는 수행기관 관리자(자기 기관) */
    case 'POST change_request':
        need('worker', 'org');
        $b = body();
        $s = q('SELECT * FROM schedules WHERE id=?', [(int)($b['schedule_id'] ?? 0)])->fetch();
        if (!$s) fail('일정을 찾을 수 없습니다.', 404);
        if ($me['role'] === 'worker' && (int)$s['worker_id'] !== (int)$me['worker_id']) fail('내 일정이 아닙니다.', 403);
        if ($me['role'] === 'org' && (int)$s['service_id'] !== (int)$me['org_id']) fail('다른 기관의 일정입니다.', 403);
        if ($s['date'] < $today) fail('지난 일정은 바꿀 수 없습니다.');
        $nd = valid_date($b['date'] ?? null);
        $nm = parse_hm($b['time'] ?? null) ?? (int)$s['planned_min'];
        $reason = trim((string)($b['reason'] ?? ''));
        if ($reason === '') fail('바꾸려는 이유를 적어 주세요.');
        if ($nd < $today) fail('오늘 이후 날짜로만 옮길 수 있습니다.');
        if (q("SELECT 1 FROM change_requests WHERE schedule_id=? AND status='대기'", [$s['id']])->fetch()) fail('이미 처리 대기 중인 요청이 있습니다.');
        q('INSERT INTO change_requests (schedule_id, requested_by, requested_at, new_date, new_min, reason) VALUES (?,?,?,?,?,?)',
          [$s['id'], $uid, date('Y-m-d H:i:s'), $nd, $nm, mb_substr($reason, 0, 500)]);
        audit('change_request', 'schedule#' . $s['id'], "$nd " . hm($nm) . " · $reason");
        out(['ok' => true]);

    case 'POST change_decide':
        need('admin', 'central');
        $b = body();
        $c = q('SELECT c.*, s.enrollment_id FROM change_requests c JOIN schedules s ON s.id = c.schedule_id WHERE c.id=?', [(int)($b['id'] ?? 0)])->fetch();
        if (!$c || $c['status'] !== '대기') fail('처리할 요청이 없습니다.');
        $ok = ($b['decision'] ?? '') === '승인';
        $note = mb_substr(trim((string)($b['note'] ?? '')), 0, 500);
        if ($ok) {
            if (q('SELECT 1 FROM visits WHERE schedule_id=?', [$c['schedule_id']])->fetch()) fail('이미 수행기록이 있어 옮길 수 없습니다.');
            if (q('SELECT 1 FROM schedules WHERE date=? AND enrollment_id=? AND id<>?', [$c['new_date'], $c['enrollment_id'], $c['schedule_id']])->fetch()) fail('옮길 날짜에 같은 어르신의 같은 서비스 일정이 이미 있습니다.');
            q('UPDATE schedules SET date=?, planned_min=? WHERE id=?', [$c['new_date'], $c['new_min'], $c['schedule_id']]);
        } elseif ($note === '') fail('반려 사유를 적어 주세요.');
        q('UPDATE change_requests SET status=?, decided_by=?, decided_at=?, note=? WHERE id=?', [$ok ? '승인' : '반려', $uid, date('Y-m-d H:i:s'), $note ?: null, $c['id']]);
        audit('change_decide', 'request#' . $c['id'], ($ok ? '승인' : '반려') . ($note ? " · $note" : ''));
        out(['ok' => true]);

    /* ================= 월간 계획 (수행기관) ================= */
    case 'POST plan_draft':
        need('org');
        $sid = (int)$me['org_id'];
        $ym = valid_ym(body()['ym'] ?? null);
        if (!plan_editable($sid, $ym)) fail('제출했거나 승인된 계획에는 초안을 다시 만들 수 없습니다.');
        db()->beginTransaction();
        $n = generate_schedules("$ym-01", date('Y-m-t', strtotime("$ym-01")), $sid);
        db()->commit();
        audit('plan_draft', "$ym " . services()[$sid]['short'], "{$n}건 검토");
        out(['ok' => true, 'checked' => $n]);

    case 'POST plan_submit':
        need('org');
        $sid = (int)$me['org_id'];
        $ym = valid_ym(body()['ym'] ?? null);
        if (!plan_editable($sid, $ym)) fail('이미 제출했거나 승인된 계획입니다.');
        if (plan_check($sid, $ym)['total'] === 0) fail('일정이 없습니다. 먼저 초안을 만들어 주세요.');
        plan_set($sid, $ym, ['status' => '제출', 'submitted_at' => date('Y-m-d H:i:s'), 'submitted_by' => $uid, 'decided_at' => null, 'decided_by' => null]);
        audit('plan_submit', "$ym " . services()[$sid]['short']);
        out(['ok' => true]);

    case 'POST plan_decide':
        need('admin', 'central');
        $b = body();
        $sid = (int)($b['sid'] ?? 0);
        $ym = valid_ym($b['ym'] ?? null);
        if (!isset(services()[$sid])) fail('서비스를 찾을 수 없습니다.');
        if (plan_status($sid, $ym)['status'] !== '제출') fail('제출된 계획만 승인하거나 반려할 수 있습니다.');
        $ok = ($b['decision'] ?? '') === '승인';
        $note = mb_substr(trim((string)($b['note'] ?? '')), 0, 500);
        if (!$ok && $note === '') fail('반려 사유를 적어 주세요.');
        plan_set($sid, $ym, ['status' => $ok ? '승인' : '반려', 'note' => $note ?: null, 'decided_at' => date('Y-m-d H:i:s'), 'decided_by' => $uid]);
        audit('plan_decide', "$ym " . services()[$sid]['short'], ($ok ? '승인' : '반려') . ($note ? " · $note" : ''));
        out(['ok' => true]);

    case 'POST schedule_update':
        need('org');
        $b = body();
        $s = own_schedule((int)($b['id'] ?? 0));
        if ($why = schedule_lock_reason($s)) fail($why);
        $nd = valid_date($b['date'] ?? $s['date']);
        $nm = parse_hm($b['time'] ?? null) ?? (int)$s['planned_min'];
        $nw = (int)($b['wid'] ?? $s['worker_id']);
        if ($nd <= $today) fail('내일 이후 날짜로만 옮길 수 있습니다.');
        if (!plan_editable((int)$s['service_id'], ym_of($nd))) fail('옮길 달의 계획이 이미 제출 또는 승인되었습니다.');
        if (!q('SELECT 1 FROM workers WHERE id=? AND service_id=? AND active=1', [$nw, $s['service_id']])->fetch()) fail('우리 기관 담당자만 지정할 수 있습니다.');
        if ($nd !== $s['date'] && q('SELECT 1 FROM schedules WHERE date=? AND enrollment_id=?', [$nd, $s['enrollment_id']])->fetch()) fail('그 날짜에 같은 어르신의 일정이 이미 있습니다.');
        q('UPDATE schedules SET date=?, planned_min=?, worker_id=? WHERE id=?', [$nd, $nm, $nw, $s['id']]);
        audit('schedule_update', 'schedule#' . $s['id'], "{$s['date']} → $nd " . hm($nm));
        out(['ok' => true]);

    case 'POST schedule_delete':
        need('org');
        $s = own_schedule((int)(body()['id'] ?? 0));
        if ($why = schedule_lock_reason($s)) fail($why);
        q('DELETE FROM schedules WHERE id=?', [$s['id']]);
        audit('schedule_delete', 'schedule#' . $s['id'], $s['date']);
        out(['ok' => true]);

    case 'POST schedule_add':
        need('org');
        $sid = (int)$me['org_id'];
        $b = body();
        $e = q('SELECT * FROM enrollments WHERE recipient_id=? AND service_id=?', [(int)($b['rid'] ?? 0), $sid])->fetch();
        if (!$e) fail('우리 기관 서비스를 이용하는 어르신을 골라 주세요.');
        $d = valid_date($b['date'] ?? null);
        $t = parse_hm($b['time'] ?? null);
        if ($t === null) fail('시각을 HH:MM 형식으로 적어 주세요.');
        if ($d <= $today) fail('내일 이후 날짜만 추가할 수 있습니다.');
        if (!plan_editable($sid, ym_of($d))) fail('그 달 계획은 이미 제출 또는 승인되었습니다.');
        if (q('SELECT 1 FROM schedules WHERE date=? AND enrollment_id=?', [$d, $e['id']])->fetch()) fail('그 날짜에 이미 일정이 있습니다.');
        $wid = (int)($b['wid'] ?? 0) ?: (int)$e['worker_id'];
        q('INSERT INTO schedules (date, enrollment_id, recipient_id, service_id, worker_id, planned_min, duration) VALUES (?,?,?,?,?,?,?)',
          [$d, $e['id'], $e['recipient_id'], $sid, $wid, $t, (int)services()[$sid]['dur']]);
        audit('schedule_add', 'recipient#' . $e['recipient_id'], "$d " . hm($t));
        out(['ok' => true]);

    /** 하루 일정을 다른 날로 한꺼번에 옮김 (공휴일 등). 옮길 날에 같은 어르신 일정이 있으면 건너뜀 */
    case 'POST bulk_move':
        need('org');
        $sid = (int)$me['org_id'];
        $b = body();
        $from = valid_date($b['from'] ?? null);
        $to = valid_date($b['to'] ?? null);
        if ($from <= $today || $to <= $today) fail('내일 이후 날짜만 옮길 수 있습니다.');
        if (!plan_editable($sid, ym_of($from)) || !plan_editable($sid, ym_of($to))) fail('제출 또는 승인된 달은 바로 옮길 수 없습니다.');
        $moved = 0; $skipped = 0;
        db()->beginTransaction();
        foreach (q('SELECT s.* FROM schedules s LEFT JOIN visits v ON v.schedule_id=s.id WHERE s.service_id=? AND s.date=? AND v.id IS NULL', [$sid, $from])->fetchAll() as $s) {
            if (q('SELECT 1 FROM schedules WHERE date=? AND enrollment_id=?', [$to, $s['enrollment_id']])->fetch()) { $skipped++; continue; }
            q('UPDATE schedules SET date=? WHERE id=?', [$to, $s['id']]);
            $moved++;
        }
        db()->commit();
        audit('bulk_move', "$from → $to", "옮김 $moved · 건너뜀 $skipped");
        out(['ok' => true, 'moved' => $moved, 'skipped' => $skipped]);

    /** 담당자 일정을 다른 담당자에게 한꺼번에 넘김 (휴가·퇴사) */
    case 'POST bulk_transfer':
        need('org');
        $sid = (int)$me['org_id'];
        $b = body();
        $fw = (int)($b['from_wid'] ?? 0); $tw = (int)($b['to_wid'] ?? 0);
        $from = valid_date($b['from'] ?? null); $to = valid_date($b['to'] ?? null);
        if ($fw === $tw) fail('서로 다른 담당자를 골라 주세요.');
        foreach ([$fw, $tw] as $w) if (!q('SELECT 1 FROM workers WHERE id=? AND service_id=?', [$w, $sid])->fetch()) fail('우리 기관 담당자만 고를 수 있습니다.');
        if ($from <= $today) $from = add_days($today, 1);
        if ($to < $from) fail('기간을 다시 확인해 주세요.');
        $n = 0; $locked = 0;
        db()->beginTransaction();
        foreach (q('SELECT s.* FROM schedules s LEFT JOIN visits v ON v.schedule_id=s.id WHERE s.worker_id=? AND s.date BETWEEN ? AND ? AND v.id IS NULL', [$fw, $from, $to])->fetchAll() as $s) {
            if (!plan_editable($sid, ym_of($s['date']))) { $locked++; continue; }
            q('UPDATE schedules SET worker_id=? WHERE id=?', [$tw, $s['id']]);
            $n++;
        }
        if (!empty($b['permanent'])) q('UPDATE enrollments SET worker_id=? WHERE worker_id=?', [$tw, $fw]);
        db()->commit();
        audit('bulk_transfer', "worker#$fw → worker#$tw", "$from~$to · {$n}건" . ($locked ? " · 확정된 달 {$locked}건 제외" : '') . (!empty($b['permanent']) ? ' · 담당 변경' : ''));
        out(['ok' => true, 'moved' => $n, 'locked' => $locked]);

    /* ================= 관리 ================= */
    case 'POST care':
        need('admin', 'central');
        $b = body();
        $rid = (int)($b['rid'] ?? 0);
        if (!$rid) fail('수혜자를 골라 주세요.');
        if (!empty($b['remove'])) { q('DELETE FROM care_cases WHERE recipient_id=?', [$rid]); audit('care_remove', 'recipient#' . $rid); out(['ok' => true]); }
        $cur = q('SELECT * FROM care_cases WHERE recipient_id=?', [$rid])->fetch();
        $st = mb_substr((string)($b['status'] ?? ($cur['status'] ?? '미확인')), 0, 20);
        $memo = mb_substr((string)($b['memo'] ?? ($cur['memo'] ?? '')), 0, 1000);
        $manual = (int)($b['manual'] ?? ($cur['manual'] ?? 0));
        q('DELETE FROM care_cases WHERE recipient_id=?', [$rid]);
        q('INSERT INTO care_cases (recipient_id, status, memo, manual, updated_at) VALUES (?,?,?,?,?)', [$rid, $st, $memo, $manual, date('Y-m-d H:i:s')]);
        audit('care_update', 'recipient#' . $rid, "$st $memo");
        out(['ok' => true]);

    case 'POST report':
        $b = body();
        $name = trim((string)($b['name'] ?? ''));
        $reason = trim((string)($b['reason'] ?? ''));
        if ($name === '' || $reason === '') fail('대상자 이름과 발굴 사유를 적어 주세요.');
        $needs = array_values(array_filter(array_map('strval', (array)($b['needs'] ?? []))));
        $reporter = trim((string)($b['reporter'] ?? '')) ?: ($me['name'] . ($me['srole'] && $me['role'] === 'worker' ? " ({$me['srole']})" : ' (' . (ROLE_LABEL[$me['role']] ?? '') . ')'));
        q('INSERT INTO reports (created_at, reporter, name, age, emd, needs, reason, status) VALUES (?,?,?,?,?,?,?,?)', [
            date('Y-m-d H:i:s'), mb_substr($reporter, 0, 80), mb_substr($name, 0, 40),
            mb_substr((string)($b['age'] ?? ''), 0, 5), in_array($b['emd'] ?? '', EMD, true) ? $b['emd'] : null,
            json_encode($needs ?: ['확인 필요'], JSON_UNESCAPED_UNICODE), mb_substr($reason, 0, 2000), '접수']);
        audit('report', $name);
        out(['ok' => true]);

    case 'POST report_status':
        need('admin', 'central');
        $b = body();
        $st = (string)($b['status'] ?? '');
        if (!in_array($st, ['접수', '현장확인', '서비스연계', '종결'], true)) fail('처리 단계가 올바르지 않습니다.');
        q('UPDATE reports SET status=? WHERE id=?', [$st, (int)($b['id'] ?? 0)]);
        audit('report_status', 'report#' . (int)($b['id'] ?? 0), $st);
        out(['ok' => true]);

    /** 계정 만들기: 관리자=모든 역할, 총괄=기관 관리자·조회 전용, 기관 관리자=소속 현장 수행자 */
    case 'POST user_create':
        need('admin', 'central', 'org');
        $b = body();
        $role = (string)($b['role'] ?? '');
        $allowed = ['admin' => ['admin', 'central', 'org', 'viewer'], 'central' => ['org', 'viewer'], 'org' => ['worker']][$me['role']];
        if (!in_array($role, $allowed, true)) fail('만들 수 없는 역할입니다.', 403);
        $login = trim((string)($b['login_id'] ?? ''));
        $name = trim((string)($b['name'] ?? ''));
        if (!preg_match('/^[a-zA-Z0-9_.-]{3,30}$/', $login)) fail('아이디는 영문·숫자 3~30자로 적어 주세요.');
        if ($name === '') fail('이름을 적어 주세요.');
        if (q('SELECT 1 FROM users WHERE login_id=?', [$login])->fetch()) fail('이미 쓰고 있는 아이디입니다.');
        $orgId = null; $wid = null;
        $phone = mb_substr(trim((string)($b['phone'] ?? '')), 0, 20) ?: null;
        if ($role === 'org') { $orgId = (int)($b['org_id'] ?? 0); if (!isset(services()[$orgId])) fail('기관을 골라 주세요.'); }
        if ($role === 'worker') {
            $orgId = (int)$me['org_id'];
            $emd = in_array($b['emd'] ?? '', EMD, true) ? $b['emd'] : EMD[0];
            $wid = (int)q('SELECT COALESCE(MAX(id),0)+1 n FROM workers')->fetch()['n'];
            q('INSERT INTO workers (id, service_id, name, phone, emd, active, demo_slack) VALUES (?,?,?,?,?,1,0)', [$wid, $orgId, mb_substr($name, 0, 40), $phone, $emd]);
        }
        $pw = temp_password();
        q('INSERT INTO users (login_id, pw_hash, name, phone, role, org_id, worker_id, must_change, created_at, created_by) VALUES (?,?,?,?,?,?,?,1,?,?)',
          [$login, password_hash($pw, PASSWORD_DEFAULT), mb_substr($name, 0, 40), $phone, $role, $orgId, $wid, date('Y-m-d H:i:s'), $uid]);
        audit('user_create', $login, ROLE_LABEL[$role]);
        out(['ok' => true, 'temp_password' => $pw]);

    case 'POST user_update':
        need('admin', 'central', 'org');
        $b = body();
        $u = q('SELECT * FROM users WHERE id=?', [(int)($b['id'] ?? 0)])->fetch();
        if (!$u) fail('계정을 찾을 수 없습니다.', 404);
        $can = $me['role'] === 'admin'
            || ($me['role'] === 'central' && in_array($u['role'], ['org', 'viewer'], true))
            || ($me['role'] === 'org' && $u['role'] === 'worker' && (int)$u['org_id'] === (int)$me['org_id']);
        if (!$can || (int)$u['id'] === $uid) fail('이 계정은 바꿀 수 없습니다.', 403);
        $res = ['ok' => true];
        if (isset($b['active'])) {
            $act = $b['active'] ? 1 : 0;
            q('UPDATE users SET active=? WHERE id=?', [$act, $u['id']]);
            if ($u['worker_id']) q('UPDATE workers SET active=? WHERE id=?', [$act, $u['worker_id']]);
            audit($act ? 'user_activate' : 'user_deactivate', $u['login_id']);
            if (!$act && $u['worker_id']) {
                $res['remaining'] = (int)q('SELECT COUNT(*) c FROM schedules s LEFT JOIN visits v ON v.schedule_id=s.id WHERE s.worker_id=? AND s.date>? AND v.id IS NULL', [$u['worker_id'], $today])->fetch()['c'];
            }
        }
        if (!empty($b['reset'])) {
            $pw = temp_password();
            q('UPDATE users SET pw_hash=?, must_change=1, fail_count=0, locked_until=NULL WHERE id=?', [password_hash($pw, PASSWORD_DEFAULT), $u['id']]);
            audit('user_reset', $u['login_id']);
            $res['temp_password'] = $pw;
        }
        out($res);

    case 'POST my_password':
        $b = body();
        $u = q('SELECT * FROM users WHERE id=?', [$uid])->fetch();
        if (!password_verify((string)($b['current'] ?? ''), $u['pw_hash'])) fail('지금 비밀번호가 맞지 않습니다.');
        $new = (string)($b['new'] ?? '');
        if (mb_strlen($new) < 8 || !preg_match('/[A-Za-z]/', $new) || !preg_match('/\d/', $new)) fail('새 비밀번호는 영문과 숫자를 섞어 8자 이상으로 만들어 주세요.');
        if ($new === (string)$b['current']) fail('지금과 다른 비밀번호로 바꿔 주세요.');
        q('UPDATE users SET pw_hash=?, must_change=0 WHERE id=?', [password_hash($new, PASSWORD_DEFAULT), $uid]);
        audit('password_change', $me['login_id']);
        out(['ok' => true]);

    default:
        fail('알 수 없는 요청입니다.', 404);
    }
} catch (Throwable $e) {
    if (db()->inTransaction()) db()->rollBack();
    error_log((string)$e);
    out(['error' => '서버 오류가 발생했습니다: ' . $e->getMessage()], 500);
}
