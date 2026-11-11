<?php
/**
 * 방문 일정 생성 (명령줄 전용)
 *   php make_schedules.php 2027-01-01 2027-12-31
 * 이용 규칙(enrollments.rule)에 따라 기간 안의 일정을 만듭니다. 이미 있는 일정은 건너뜁니다.
 */
declare(strict_types=1);
if (PHP_SAPI !== 'cli') { http_response_code(403); exit('명령줄에서만 실행할 수 있습니다.'); }
require __DIR__ . '/lib/core.php';
[$_, $from, $to] = $argv + [null, null, null];
if (!$from || !$to || !preg_match('/^\d{4}-\d{2}-\d{2}$/', $from) || !preg_match('/^\d{4}-\d{2}-\d{2}$/', $to)) {
    exit("사용법: php make_schedules.php 시작일 종료일   예) php make_schedules.php 2027-01-01 2027-12-31\n");
}
db()->beginTransaction();
$n = generate_schedules($from, $to);
db()->commit();
echo "$from ~ $to 일정 검토 {$n}건 (이미 있던 일정은 건너뜀)\n";
