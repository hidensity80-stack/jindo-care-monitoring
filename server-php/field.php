<?php
/** 현장 앱 (수행기관 담당자용, 휴대폰 화면 기준) */
declare(strict_types=1);
require __DIR__ . '/lib/core.php';
$me = require_page(['worker']);
$h = fn($s) => htmlspecialchars((string)$s, ENT_QUOTES);
?><!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>진도 통합돌봄 현장 앱</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+KR:wght@400;500;600;700&display=swap">
<link rel="stylesheet" href="assets/app.css">
<style>
  body{font-size:15px}
  .fwrap{max-width:560px;margin:0 auto;padding-left:max(14px,env(safe-area-inset-left,0px));padding-right:max(14px,env(safe-area-inset-right,0px));padding-block:14px 90px;display:flex;flex-direction:column;gap:12px}
  .who{display:flex;flex-direction:column;gap:6px}
  .who select{font-size:15px;padding:9px 10px;border:1px solid var(--line);border-radius:9px;background:var(--surface)}
  .sum{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:6px}
  .sum div{background:var(--surface);border:1px solid var(--line);border-radius:9px;padding:8px;text-align:center}
  .sum b{display:block;font-size:20px;font-variant-numeric:tabular-nums}
  .sum span{font-size:12px;color:var(--muted)}
  .card{background:var(--surface);border:1px solid var(--line);border-radius:12px;padding:12px 14px;display:flex;flex-direction:column;gap:8px}
  .card.done{opacity:.75}
  .card .top1{display:flex;justify-content:space-between;align-items:center;gap:8px}
  .card .tm{font-size:18px;font-weight:700;font-variant-numeric:tabular-nums}
  .card .nm{font-size:17px;font-weight:700}
  .card .meta{font-size:13px;color:var(--muted)}
  .acts{display:flex;gap:8px}
  .acts button{flex:1;padding:12px 8px;font-size:16px;font-weight:700;border-radius:10px;border:1px solid var(--line);background:var(--surface);cursor:pointer}
  .acts .go{background:var(--accent);border-color:var(--accent);color:var(--accent-ink)}
  .acts .end{background:var(--st-done);border-color:var(--st-done);color:#fff}
  .sheet{position:fixed;left:0;right:0;bottom:0;z-index:50;background:var(--surface);border-radius:16px 16px 0 0;box-shadow:var(--shadow);max-height:88vh;overflow:auto;
    padding:16px max(16px,env(safe-area-inset-right,0px)) calc(20px + env(safe-area-inset-bottom,0px)) max(16px,env(safe-area-inset-left,0px));display:flex;flex-direction:column;gap:12px;max-width:560px;margin:0 auto}
  .hbtns{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}
  .hbtns button{padding:16px 6px;border-radius:12px;border:2px solid var(--line);background:var(--surface);font-size:17px;font-weight:700;cursor:pointer}
  .hbtns button[aria-pressed="true"]{border-color:var(--hc);background:color-mix(in srgb,var(--hc) 18%,var(--surface))}
  .fl{display:flex;flex-wrap:wrap;gap:8px}
  .fl label{display:flex;align-items:center;gap:6px;border:1px solid var(--line);border-radius:999px;padding:7px 12px;font-size:14px}
  .sheet textarea,.sheet input,.sheet select{width:100%;font-size:15px;padding:9px 10px;border:1px solid var(--line);border-radius:9px;background:var(--surface)}
  .acts2{display:flex;justify-content:space-between;align-items:center;gap:8px}
  .acts2 button{border:1px solid var(--line);background:var(--surface);border-radius:8px;padding:7px 12px;font-size:14px;cursor:pointer}
  .acts2 .emgb{margin-left:auto;border-color:color-mix(in srgb,var(--st-miss) 55%,transparent);color:var(--st-miss);font-weight:700}
  .acts .emgb2{background:var(--st-miss);border-color:var(--st-miss);color:#fff}
  .sheet label.label{display:flex;flex-direction:column;gap:4px;text-transform:none;letter-spacing:0;font-size:13px}
  .fab{position:fixed;right:max(16px,env(safe-area-inset-right,0px));bottom:calc(16px + env(safe-area-inset-bottom,0px));z-index:30;border-radius:999px;padding:13px 18px;font-weight:700;background:var(--ink);color:var(--bg);border:0;box-shadow:var(--shadow);cursor:pointer}
</style>
</head>
<body>
<header class="top">
  <div class="brand"><div class="mark">진도</div><div><h1><?= $h($me['name']) ?>님의 오늘 방문</h1><p id="today"><?= $h($me['sname'] . ' · ' . $me['srole']) ?></p></div></div>
  <div style="margin-left:auto;display:flex;gap:6px"><button class="btn sm" data-act="mypw">비밀번호</button><a class="btn sm" href="logout.php" style="text-decoration:none;color:inherit">로그아웃</a></div>
</header>
<?php if (cfg('DEMO_MODE')): ?><div class="proto">데모 모드: 기록 일부가 시각에 맞춰 자동으로 채워집니다. 아직 시각이 오지 않은 일정으로 눌러 보세요.</div><?php endif; ?>
<div class="fwrap">
  <div class="sum" id="sum"></div>
  <div id="list"><p class="empty-note">불러오는 중…</p></div>
  <p class="empty-note" style="text-align:center">생명이 위급하면 먼저 <b>119</b>에 신고한 뒤 [긴급]을 눌러 알려 주세요.</p>
</div>
<button class="fab" id="repbtn">이웃 발굴신고</button>
<div id="sheetbox"></div>
<script src="assets/field.js"></script>
</body>
</html>
