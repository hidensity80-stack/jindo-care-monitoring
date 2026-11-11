<?php
/**
 * 진도군 통합돌봄 모니터링 - 설정 예시 파일
 *
 * 이 파일을 복사해 config.php로 이름을 바꾼 뒤 서버에 맞게 고치세요.
 * config.php는 .gitignore에 들어 있어 GitHub에 올라가지 않습니다.
 *
 * 기본값은 SQLite(별도 DB 서버 불필요)입니다.
 * MySQL/MariaDB를 쓰려면 DB_DSN, DB_USER, DB_PASS를 바꾸세요.
 *   예) 'mysql:host=127.0.0.1;dbname=jindo_care;charset=utf8mb4'
 */
return [
    'DB_DSN'  => 'sqlite:' . __DIR__ . '/data/jindo.sqlite',
    'DB_USER' => null,
    'DB_PASS' => null,

    // 시간대 (현장 앱 시작·종료 시각 기준)
    'TIMEZONE' => 'Asia/Seoul',

    // 데모 모드: true이면 대시보드를 열 때마다 오늘 일정의 수행 기록을
    // 현재 시각에 맞춰 자동으로 채웁니다 (현장 앱 입력을 흉내 냄).
    // 실제 운영 시에는 반드시 false로 바꾸세요.
    'DEMO_MODE' => true,

    // 설치 스크립트(install.php) 실행 시 필요한 키. 설치 후 install.php는 삭제하세요.
    'INSTALL_KEY' => 'change-me-before-install',

    // 위험 판정 기준 (점수)
    'RISK' => [
        'BAD_POINT'        => 2,   // 건강상태 '나쁨' 1회당
        'MULTI_SVC_POINT'  => 4,   // 서로 다른 서비스 2곳 이상에서 이상 보고
        'MISS_POINT'       => 1,   // 미수행 1회당
        'LATE_POINT'       => 2,   // 오늘 지연·미시작 1건당
        'ALONE_POINT'      => 1,   // 독거 + 이상 보고
        'LEVEL_DANGER'     => 10,  // 위험
        'LEVEL_WARN'       => 6,   // 주의
        'LEVEL_WATCH'      => 3,   // 관심
        'WINDOW_DAYS'      => 14,  // 판정 기간
    ],
];
