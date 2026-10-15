<?php
declare(strict_types=1);
// Als zusätzliche Plesk-Deployment-Aktion ausführen; kein öffentlicher HTTP-Endpunkt.
if (PHP_SAPI !== 'cli') exit(1);
require_once dirname(__DIR__) . '/app/bootstrap.php';
try {
    if (PHP_VERSION_ID < 80200) throw new RuntimeException('PHP 8.2 oder neuer ist erforderlich.');
    $root = dirname(__DIR__);
    if (is_file($root . '/config.php') || getenv('PALLE_CONFIG')) {
        migrate(); // Nur fehlende Tabellen ergänzen; bestehende Nutzerdaten bleiben erhalten.
        storage();
        echo "Datenbankschema geprüft.\n";
    } else {
        echo "Erste Bereitstellung: config.php und persönlichen Benutzer noch einrichten.\n";
    }
    $files = [];
    foreach (new RecursiveIteratorIterator(new RecursiveDirectoryIterator($root . '/public', FilesystemIterator::SKIP_DOTS)) as $file) {
        if ($file->isFile() && $file->getFilename() !== 'sw.js' && $file->getExtension() !== 'php') $files[] = $file->getPathname();
    }
    sort($files, SORT_STRING);
    $hash = hash_init('sha256');
    foreach ($files as $file) { hash_update($hash, substr($file, strlen($root)) . "\0"); hash_update_file($hash, $file); }
    $version = substr(hash_final($hash), 0, 16);
    $path = $root . '/public/sw.js';
    $source = file_get_contents($path);
    if ($source === false) throw new RuntimeException('Service Worker konnte nicht gelesen werden.');
    $updated = preg_replace("/const CACHE='palle-shell-[^']+';/", "const CACHE='palle-shell-" . $version . "';", $source, 1, $count);
    if ($count !== 1 || $updated === null) throw new RuntimeException('Service-Worker-Versionsmarkierung fehlt.');
    if ($source !== $updated && file_put_contents($path, $updated, LOCK_EX) === false) throw new RuntimeException('Service-Worker-Version konnte nicht aktualisiert werden.');
    echo "Palle bereitgestellt. App-Cache: " . $version . "\n";
} catch (Throwable $e) { fwrite(STDERR, $e->getMessage() . "\n"); exit(1); }
