<?php
declare(strict_types=1);
function config(): array {
    static $config;
    if ($config !== null) return $config;
    $path = getenv('PALLE_CONFIG') ?: dirname(__DIR__) . '/config.php';
    if (!is_file($path)) throw new RuntimeException('Palle ist noch nicht eingerichtet. Bitte config.php und Datenbank installieren.');
    $config = require $path;
    if (!is_array($config) || empty($config['dsn']) || empty($config['storage'])) throw new RuntimeException('Serverkonfiguration ist unvollständig.');
    return $config;
}
function db(): PDO {
    static $db;
    if ($db) return $db;
    $c = config();
    $db = new PDO($c['dsn'], $c['db_user'] ?? '', $c['db_password'] ?? '', [PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION, PDO::ATTR_DEFAULT_FETCH_MODE=>PDO::FETCH_ASSOC, PDO::ATTR_EMULATE_PREPARES=>false]);
    if (str_starts_with($c['dsn'], 'sqlite:')) $db->exec('PRAGMA busy_timeout=5000');
    return $db;
}
function storage(): string {
    $path = rtrim(config()['storage'], '/');
    if (!is_dir($path) && !mkdir($path, 0700, true)) throw new RuntimeException('Speicherverzeichnis konnte nicht erstellt werden.');
    $real = realpath($path);
    $public = realpath(dirname(__DIR__) . '/public');
    if (!$real || ($public && ($real === $public || str_starts_with($real, $public . '/')))) throw new RuntimeException('Privater Speicher muss außerhalb des Web-Stammverzeichnisses liegen.');
    return $real;
}
function blankState(): array { return ['devices'=>[], 'works'=>[], 'tasks'=>[], 'shifts'=>[], 'templates'=>[]]; }
function migrate(): void {
    $db = db();
    $db->exec('CREATE TABLE IF NOT EXISTS palle_users (id VARCHAR(36) PRIMARY KEY, username VARCHAR(190) NOT NULL UNIQUE, password_hash VARCHAR(255) NOT NULL)');
    $db->exec('CREATE TABLE IF NOT EXISTS palle_state (id INTEGER PRIMARY KEY, revision BIGINT NOT NULL, payload LONGTEXT NOT NULL)');
    $db->exec('CREATE TABLE IF NOT EXISTS palle_photos (id VARCHAR(36) PRIMARY KEY, user_id VARCHAR(36) NOT NULL, filename VARCHAR(80) NOT NULL, mime VARCHAR(40) NOT NULL, created_at VARCHAR(40) NOT NULL)');
    $db->exec('CREATE TABLE IF NOT EXISTS palle_subscriptions (endpoint_hash VARCHAR(64) PRIMARY KEY, user_id VARCHAR(36) NOT NULL, payload TEXT NOT NULL)');
    $db->exec('CREATE TABLE IF NOT EXISTS palle_deliveries (receipt_key VARCHAR(64) PRIMARY KEY, delivered_at VARCHAR(40) NOT NULL)');
    $db->exec('CREATE TABLE IF NOT EXISTS palle_login_attempts (ip_hash VARCHAR(64) PRIMARY KEY, failures INTEGER NOT NULL, last_attempt BIGINT NOT NULL)');
    $q = $db->query('SELECT id FROM palle_state WHERE id=1');
    if (!$q->fetch()) $db->prepare('INSERT INTO palle_state(id,revision,payload) VALUES(1,0,?)')->execute([json_encode(blankState(), JSON_THROW_ON_ERROR)]);
}
function startSession(): void {
    $dir = storage() . '/sessions';
    if (!is_dir($dir)) mkdir($dir, 0700, true);
    ini_set('session.use_strict_mode','1');
    ini_set('session.use_only_cookies','1');
    ini_set('session.gc_maxlifetime', (string)(30*86400));
    session_save_path($dir);
    session_name('palle_session');
    session_set_cookie_params(['lifetime'=>30*86400, 'path'=>'/', 'secure'=>config()['secure_cookie'] ?? true, 'httponly'=>true, 'samesite'=>'Strict']);
    session_start();
    $_SESSION['csrf'] ??= bin2hex(random_bytes(32));
}
function sendJson(array $data, int $code=200): never { http_response_code($code); header('Content-Type: application/json; charset=utf-8'); echo json_encode($data, JSON_THROW_ON_ERROR|JSON_UNESCAPED_UNICODE); exit; }
function inputJson(): array {
    $body=file_get_contents('php://input');
    if (strlen($body)>10*1024*1024) sendJson(['error'=>'Die Daten sind zu groß.'],413);
    try { $data=json_decode($body,true,512,JSON_THROW_ON_ERROR); } catch (JsonException) { sendJson(['error'=>'Ungültige Anfrage.'],400); }
    if (!is_array($data)) sendJson(['error'=>'Ungültige Anfrage.'],400);
    return $data;
}
function guard(bool $csrf=true): string {
    if (empty($_SESSION['user_id'])) sendJson(['error'=>'Bitte anmelden.'],401);
    if ($csrf && !hash_equals($_SESSION['csrf'], $_SERVER['HTTP_X_PALLE_CSRF'] ?? '')) sendJson(['error'=>'Sicherheitsprüfung fehlgeschlagen. Bitte neu anmelden.'],403);
    return $_SESSION['user_id'];
}
function validId(mixed $id): bool { return is_string($id) && (bool)preg_match('/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/D', $id); }
function must(bool $condition, string $message): void { if (!$condition) throw new InvalidArgumentException($message); }
function timestamp(mixed $value): int {
    must(is_string($value) && (bool)preg_match('/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?Z$/D', $value), 'Ungültiger Zeitpunkt.');
    $time = strtotime($value);must($time!==false, 'Ungültiger Zeitpunkt.');return $time;
}
function textField(array $entity,string $key,int $max=500,bool $required=false): void {
    must(isset($entity[$key]) && is_string($entity[$key]) && mb_strlen($entity[$key]) <= $max, 'Ungültiges Textfeld: ' . $key);
    if ($required) must(trim($entity[$key])!=='', 'Pflichtfeld fehlt: ' . $key);
}
function isHttpsEndpoint(string $endpoint): bool {
    $host = strtolower(parse_url($endpoint, PHP_URL_HOST) ?? '');
    return parse_url($endpoint, PHP_URL_SCHEME)==='https' && !parse_url($endpoint,PHP_URL_USER) && !parse_url($endpoint,PHP_URL_PASS) && (!parse_url($endpoint,PHP_URL_PORT)||parse_url($endpoint,PHP_URL_PORT)===443) &&
      ($host==='fcm.googleapis.com'||$host==='updates.push.services.mozilla.com'||$host==='web.push.apple.com'||str_ends_with($host,'.push.apple.com')||str_ends_with($host,'.notify.windows.com'));
}
