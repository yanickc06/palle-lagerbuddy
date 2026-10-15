<?php
// Kopieren nach config.php. Diese Datei liegt AUSSERHALB des Web-Stammverzeichnisses.
return [
    'dsn' => 'mysql:host=localhost;dbname=palle;charset=utf8mb4',
    'db_user' => 'palle',
    'db_password' => 'HIER-DATENBANKPASSWORT-EINTRAGEN',
    'app_url' => 'https://palle.conya.de',
    'storage' => __DIR__ . '/storage',
    'secure_cookie' => true,
    'vapid_public' => '',
    'vapid_private' => '',
    'vapid_subject' => 'mailto:du@deine-domain.de',
];
