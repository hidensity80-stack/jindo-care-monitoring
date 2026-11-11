<?php
/** 로그인 화면 */
declare(strict_types=1);
require __DIR__ . '/lib/core.php';

$u = current_user();
if ($u) { header('Location: ' . home_for($u['role'])); exit; }

session_boot();
if (empty($_SESSION['csrf'])) $_SESSION['csrf'] = bin2hex(random_bytes(16));
$err = '';
$id = '';
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $id = trim((string)($_POST['login_id'] ?? ''));
    if (!hash_equals($_SESSION['csrf'], (string)($_POST['csrf'] ?? ''))) {
        $err = '화면이 오래되었습니다. 다시 시도해 주세요.';
    } else {
        [$ok, $msg] = attempt_login($id, (string)($_POST['password'] ?? ''));
        if ($ok) { header('Location: ' . home_for($msg)); exit; }
        $err = $msg;
    }
}
$demo = cfg('DEMO_MODE');
$demoUsers = [];
if ($demo) {
    $w = q("SELECT u.login_id, u.name, s.short FROM users u JOIN services s ON s.id=u.org_id WHERE u.role='worker' AND u.org_id=2 AND u.active=1 ORDER BY u.id LIMIT 1")->fetch();
    $demoUsers = [
        ['central', '총괄 담당자', '군 사업관리 부서 · 전체 현황, 계획 승인, 집중관리'],
        ['org2', '수행기관 관리자', '진도가사돌봄협동조합 · 월간 계획 작성·제출, 수행자 관리'],
        [$w['login_id'] ?? 'w031', '현장 수행자', ($w['short'] ?? '가사') . ' ' . ($w['name'] ?? '') . ' · 휴대폰으로 방문 기록'],
        ['admin', '시스템 관리자', '군 전산 담당 · 계정 전체, 접속기록'],
        ['viewer', '조회 전용', '보건소 · 현황 보기만'],
    ];
}
$h = fn($s) => htmlspecialchars((string)$s, ENT_QUOTES);
?><!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>로그인 · 진도 통합돌봄</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+KR:wght@400;500;600;700&display=swap">
<link rel="stylesheet" href="assets/app.css">
<style>
  .lwrap{min-height:100vh;display:grid;place-items:center;padding:24px max(16px,env(safe-area-inset-right,0px)) 24px max(16px,env(safe-area-inset-left,0px))}
  .lbox{width:min(440px,100%);display:flex;flex-direction:column;gap:16px}
  .lbox .brand h1{font-size:20px}
  .lform{display:flex;flex-direction:column;gap:10px}
  .lform label{display:flex;flex-direction:column;gap:4px;font-size:13px;color:var(--muted)}
  .lform input{font-size:16px;padding:11px 12px;border:1px solid var(--line);border-radius:9px;background:var(--surface);color:var(--ink)}
  .lform button{font-size:16px;padding:12px;border-radius:9px}
  .err{background:color-mix(in srgb,var(--st-miss) 14%,var(--surface));border:1px solid color-mix(in srgb,var(--st-miss) 40%,transparent);border-radius:8px;padding:9px 12px;font-size:14px}
  .demo{display:flex;flex-direction:column;gap:8px}
  .demo button{display:flex;flex-direction:column;align-items:flex-start;gap:2px;text-align:left;width:100%;padding:10px 12px;border:1px solid var(--line);border-radius:9px;background:var(--surface);cursor:pointer}
  .demo button:hover{border-color:var(--accent)}
  .demo button b{font-size:14px}
  .demo button span{font-size:12px;color:var(--muted)}
</style>
</head>
<body>
<div class="lwrap"><div class="lbox">
  <div class="brand"><div class="mark">진도</div><div><h1>진도군 통합돌봄 모니터링</h1><p>계정으로 로그인하세요</p></div></div>
  <div class="panel">
    <form class="lform" method="post" autocomplete="on">
      <input type="hidden" name="csrf" value="<?= $h($_SESSION['csrf']) ?>">
      <?php if ($err): ?><div class="err" role="alert"><?= $h($err) ?></div><?php endif; ?>
      <label>아이디<input name="login_id" id="login_id" value="<?= $h($id) ?>" autocomplete="username" required autofocus></label>
      <label>비밀번호<input name="password" id="password" type="password" autocomplete="current-password" required></label>
      <button class="btn pri" type="submit">로그인</button>
      <p class="empty-note" style="margin:0">비밀번호를 잊었으면 소속 기관 관리자(기관 관리자는 군 총괄 담당자)에게 초기화를 요청하세요.</p>
    </form>
  </div>
  <?php if ($demo): ?>
  <div class="panel">
    <h3>체험용 계정으로 바로 들어가기 <small>데모 모드에서만 보입니다</small></h3>
    <div class="demo">
      <?php foreach ($demoUsers as [$lid, $role, $desc]): ?>
      <form method="post"><input type="hidden" name="csrf" value="<?= $h($_SESSION['csrf']) ?>"><input type="hidden" name="login_id" value="<?= $h($lid) ?>"><input type="hidden" name="password" value="<?= $h(DEMO_PASSWORD) ?>">
        <button type="submit"><b><?= $h($role) ?> <small style="font-weight:400;color:var(--muted)">(<?= $h($lid) ?>)</small></b><span><?= $h($desc) ?></span></button></form>
      <?php endforeach; ?>
    </div>
    <p class="empty-note" style="margin:8px 0 0">모든 체험 계정의 비밀번호는 <b><?= $h(DEMO_PASSWORD) ?></b> 입니다. 운영 전에 반드시 바꾸세요.</p>
  </div>
  <?php endif; ?>
</div></div>
</body>
</html>
