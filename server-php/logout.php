<?php
/** 로그아웃 */
declare(strict_types=1);
require __DIR__ . '/lib/core.php';
$u = current_user();
if ($u) audit('logout', $u['login_id']);
session_boot();
$_SESSION = [];
if (ini_get('session.use_cookies')) {
    $p = session_get_cookie_params();
    setcookie(session_name(), '', time() - 3600, $p['path'], $p['domain'], $p['secure'], $p['httponly']);
}
session_destroy();
header('Location: login.php');
