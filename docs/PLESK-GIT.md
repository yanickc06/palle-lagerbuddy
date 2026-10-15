# Palle über Git auf palle.conya.de bereitstellen

Repository: https://github.com/yanickc06/palle-lagerbuddy

Ziel: Änderungen werden nach einem Push auf `main` von Plesk geladen und bereitgestellt. Auf dem Server bleiben `config.php`, die Datenbank und private Fotos bestehen.

## Einmalige Verbindung

1. Plesk → **Websites & Domains → palle.conya.de → Git → Repository hinzufügen**.
2. Remote-URL eintragen: `https://github.com/yanickc06/palle-lagerbuddy.git`. Für ein privates Repository die SSH-URL `git@github.com:yanickc06/palle-lagerbuddy.git` verwenden und Plesks angezeigten öffentlichen SSH-Schlüssel unter GitHub → Repository → Settings → Deploy keys hinzufügen. Lesezugriff genügt.
3. Branch **main**, Bereitstellungsmodus **Automatisch** und einen Projektordner wie `palle-app` wählen.
4. In den Hosting-Einstellungen den **Dokumentenstamm auf `palle-app/public`** setzen. Git stellt den gesamten Projektbaum nach `palle-app` bereit, der Webserver liefert ausschließlich dessen `public/` aus.
5. In Plesks Repository-Einstellungen die **Webhook-URL** kopieren. Bei GitHub → Settings → Webhooks hinzufügen, Inhaltstyp `application/json`, Ereignis **Push**. Die Webhook-Adresse vertraulich behandeln.

Automatisches Bereitstellen allein lädt keine GitHub-Änderungen ab: Der Webhook löst das Laden aus, der Modus „Automatisch“ übernimmt anschließend die Bereitstellung. [Plesk-Dokumentation](https://docs.plesk.com/en-US/obsidian/customer-guide/git-support/using-remote-git-hosting.75848/)

## Server einmalig einrichten

Wie in [README.md](../README.md) beschrieben: PHP 8.2+, MySQL/MariaDB, HTTPS, private `config.php`, schreibbares privates `storage/`, Benutzer über `bin/install.php` und Web-Push-Schlüssel/Cronjob einrichten. `config.example.php` enthält bereits `https://palle.conya.de`.

`config.php`, `.env`, `storage/`, `vendor/`, Testdaten, lokale Ausgaben und Zugangsschlüssel sind von Git ausgeschlossen. Auf dem Server **keine** Befehle wie `git clean -fdx` oder ein Löschen des kompletten Projektordners als Deployment-Aktion verwenden: Sie würden auch private Laufzeitdateien entfernen. Backups von Datenbank und privaten Fotos bleiben unabhängig vom Code-Deployment erforderlich.

## Zusätzliche Deployment-Aktionen

Unter Plesk → Git → Repository-Einstellungen → **Zusätzliche Bereitstellungsaktionen** eintragen. `PROJEKTPFAD`, PHP-Version und Composer-Pfad müssen zu deinem Server passen; die folgenden Pfade sind Platzhalter, keine ermittelten Serverpfade:

```sh
cd /ABSOLUTER/PROJEKTPFAD/palle-app && /opt/plesk/php/8.3/bin/php /PFAD/ZU/composer.phar install --no-dev --prefer-dist --no-interaction --optimize-autoloader && /opt/plesk/php/8.3/bin/php bin/deploy.php
```

Composer kann auch über Plesks Composer-Oberfläche eingerichtet werden. Da das Projekt derzeit keine `composer.lock` mitliefert, löst Composer die Abhängigkeiten bei der ersten Installation auf dem Server auf. Die erzeugte Lockdatei anschließend für reproduzierbare weitere Updates ins Repository übernehmen. Neue oder geänderte Composer-Abhängigkeiten benötigen dann eine aktualisierte Lockdatei.

`bin/deploy.php` ergänzt fehlende Tabellen, ohne vorhandene Arbeitsdaten zurückzusetzen. Es berechnet außerdem eine App-Cache-Version aus den öffentlichen Dateien. Dadurch erkennt die installierte PWA Änderungen an Oberfläche oder Bibliotheken. Beim nächsten Öffnen kann iOS die neue Fassung laden; während eine alte Fassung noch offen ist, wird sie nicht mitten in der Arbeit ersetzt. Für einen sofortigen Wechsel Palle vollständig schließen und neu öffnen.

Der Erinnerungs-Cronjob bleibt separat jede Minute aktiv. Ein Git-Update erzeugt weder neue VAPID-Schlüssel noch ein neues Passwort.

## Ersten automatischen Durchlauf prüfen

- In GitHub die Webhook-Zustellung und in Plesk den Deployment-Status prüfen.
- Prüfen, dass in Plesk derselbe Commit wie auf GitHub angezeigt wird.
- `https://palle.conya.de` öffnen, anmelden und ein Gerät samt Dokumentation wieder aufrufen.
- Eine kleine sichtbare Änderung pushen und prüfen, ob sie nach dem automatischen Deployment und erneutem Öffnen ankommt.

Die Plesk-Verbindung und der Webhook müssen im jeweiligen Konto eingerichtet werden; allein durch den Push dieses Repositories sind sie noch nicht aktiviert.
