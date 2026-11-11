<?php
/** 대시보드 (총괄 담당자·수행기관 관리자·시스템 관리자·조회 전용). 현장 수행자는 field.php로 이동 */
declare(strict_types=1);
require __DIR__ . '/lib/core.php';
$me = require_page(['admin', 'central', 'org', 'viewer']);
$demo = cfg('DEMO_MODE');
$h = fn($s) => htmlspecialchars((string)$s, ENT_QUOTES);
$who = $me['role'] === 'org' ? $me['vendor'] : ROLE_LABEL[$me['role']];
?><!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>진도 통합돌봄 모니터링</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+KR:wght@400;500;600;700&display=swap">
<link rel="stylesheet" href="assets/app.css">
</head>
<body>
<header class="top">
  <div class="brand">
    <div class="mark">진도</div>
    <div><h1>진도군 통합돌봄 모니터링</h1><p id="brandsub"><?= $h($who) ?></p></div>
  </div>
  <nav class="tabs" role="tablist" aria-label="화면 선택" id="tabs"></nav>
  <div class="clock">
    <span class="live" id="livedot"></span><span id="clk"></span>
    <button class="btn sm" data-act="refresh">새로고침</button>
    <span class="userchip"><b><?= $h($me['name']) ?></b> · <?= $h(ROLE_LABEL[$me['role']]) ?></span>
    <button class="btn sm" data-act="mypw">비밀번호 변경</button>
    <a class="btn sm" href="logout.php" style="text-decoration:none;color:inherit">로그아웃</a>
  </div>
</header>
<?php if ($demo): ?>
<div class="proto">데모 모드입니다. 이름과 기록은 모두 가상의 예시이며, 오늘 기록은 현재 시각에 맞춰 자동으로 채워집니다.</div>
<?php endif; ?>
<div id="banner"></div>
<main id="view"><p class="empty-note">불러오는 중…</p></main>
<div id="drawerbox"></div>
<div id="modalbox"></div>
<script src="assets/dashboard.js"></script>
</body>
</html>
