# Palle

Private PWA für Lagerarbeit bei TOP Eventtechnik. Für iPhone und PC, mit dunkler Oberfläche, Barcode-Scanner und animiertem Palle. Kein App-Store und keine kostenpflichtige Apple-Entwicklermitgliedschaft nötig.

## Enthalten

- Geräte mit individuellem Barcode, Kategorie, Hersteller, Inventarnummer, Stellplatz, Foto und Zustand.
- Kamera-Barcode-Scanner (ZXing) und alternative Texteingabe; unbekannte Codes führen zur Geräteanlage.
- Laufende Dokumentationen für Funktionsprüfung, Reinigung, Reparatur, Wartung, Aufladen und Sonstiges.
- Mehrere Notizen und mehrere Fotos pro Dokumentation. Fotos aus der Mediathek gemeinsam auswählen oder nacheinander mit der Kamera aufnehmen.
- Automatisch gesicherter Notizentwurf. Offene Dokumentationen bleiben nach Navigation, Schichtende und erneutem Öffnen erhalten.
- Eigener Abschluss mit Prüfergebnis und Gerätezustand. Sammeldokumentation für mehrere Geräte.
- Bearbeitbare Prüflistenvorlagen; jede neue Dokumentation bekommt eine unabhängige Kopie.
- Einmalige und wiederkehrende Aufgaben. Bei wiederkehrenden Aufgaben beginnt das nächste Intervall am Abschlusstag.
- Kommen, mehrere Pausen, Gehen, Zeitkorrekturen und nachträgliche Schichten. Keine automatischen Pausenabzüge.
- Schichtdetails mit zugeordneten Arbeiten; Datum und Schicht einer Dokumentation können geändert werden.
- Monats-CSV und PDF über den Druckdialog (am iPhone über die Druckvorschau als PDF teilen/sichern).
- Web-Push für fällige/überfällige Aufgaben um 09:00 und 16:00 Europe/Berlin sowie einmal sechs Stunden nach „Kommen“, sofern die Schicht noch offen ist. Pausen verschieben den Hinweis nicht.
- Anmeldung per Benutzername/Passwort; private Fotos werden ausschließlich nach Anmeldung ausgeliefert.
- Lokale Zwischenspeicherung in IndexedDB, serverseitige Speicherung in MySQL/MariaDB und Schutz vor unbemerktem Überschreiben bei gleichzeitigen Änderungen auf PC/iPhone.
- JSON-Sicherung inklusive Fotos zum Herunterladen.

## Projektaufbau

`public/` ist das **einzige Web-Stammverzeichnis**. `app/`, `bin/`, `config.php`, `vendor/` und `storage/` liegen daneben und dürfen nicht öffentlich erreichbar sein.

```
palle/
  public/                 ← Plesk Document Root
  app/                    PHP-Logik
  bin/                    Einrichtung und Erinnerungsdienst
  storage/                private Fotos und Sitzungen
  vendor/                 Composer-Abhängigkeiten für Web-Push
  config.php              private Serverkonfiguration
  config.example.php
  composer.json
```

Die Datenbank speichert den gemeinsamen Arbeitsstand als JSON mit Versionsnummer sowie Benutzer, Fotometadaten, Push-Abonnements und Zustellnachweise in separaten Tabellen. Ein Schreibvorgang mit veralteter Versionsnummer wird abgewiesen; die lokale Fassung bleibt erhalten. Diese einfache Architektur ist auf die persönliche Nutzung zugeschnitten.

## Plesk einrichten

1. Subdomain anlegen, `palle.conya.de`, und HTTPS/Let's Encrypt aktivieren. HTTP auf HTTPS umleiten.
2. Projekt hochladen. Plesks Dokumentenstamm auf `palle/public` setzen. **Nicht den gesamten Projektordner als Web-Stamm verwenden.** Node-Abhängigkeiten, `work/`, `tests/` und `scripts/` werden auf dem Server nicht benötigt.
3. PHP 8.2+ aktivieren, vorzugsweise PHP-FPM. Erweiterungen: `pdo_mysql`, `fileinfo`, `mbstring`, `curl`, `openssl`; Web-Push benötigt zusätzlich die im Composer-Check genannten Erweiterungen.
4. MySQL-/MariaDB-Datenbank und Datenbankbenutzer anlegen. `config.example.php` als `config.php` kopieren und DSN, Zugangsdaten, HTTPS-Adresse und Speicherpfad eintragen. Das Passwort ausschließlich auf dem Server eintragen.
5. `storage/` für den PHP-/Subscription-Benutzer schreibbar machen (typischerweise Verzeichnisse 0700, Dateien 0600; keine pauschalen 0777-Rechte).
6. In Plesk `upload_max_filesize` mindestens auf `12M`, `post_max_size` mindestens auf `16M`, `memory_limit` auf `256M` setzen. Fotos werden im Browser auf maximal 2048 Pixel Kantenlänge als JPEG verkleinert; mehrere Fotos werden einzeln übertragen.
7. Über SSH/Terminal im Projektordner den Benutzer anlegen. Passwort wird interaktiv eingelesen und gehasht gespeichert:

   ```sh
   /opt/plesk/php/8.3/bin/php bin/install.php DEIN_BENUTZERNAME
   ```

   Den PHP-Pfad an deine installierte Version anpassen. Es gibt keine öffentliche Registrierung und keine Standardzugangsdaten.
8. Die HTTPS-Adresse öffnen und anmelden. Auf dem iPhone in Safari „Teilen → Zum Home-Bildschirm“ auswählen.

Apache liest die mitgelieferte `public/.htaccess`. Falls nginx Dateien direkt ausliefert, müssen die folgenden Header zusätzlich in den nginx-Einstellungen gesetzt werden:

```nginx
add_header X-Content-Type-Options nosniff always;
add_header X-Frame-Options DENY always;
add_header Referrer-Policy same-origin always;
add_header Permissions-Policy 'camera=(self), microphone=(), geolocation=()' always;
add_header Content-Security-Policy "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data:; media-src 'self' blob:; connect-src 'self'; worker-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'" always;
```

Keine fremden Scripts, Fonts oder CDNs werden zur Laufzeit benötigt. Bibliotheken liegen lokal in `public/vendor/`.

## Mitteilungen aktivieren

1. Composer-Abhängigkeiten auf dem Server installieren (Plesk Composer oder Terminal):

   ```sh
   composer install --no-dev --optimize-autoloader
   /opt/plesk/php/8.3/bin/php bin/vapid.php
   ```

2. Die erzeugten öffentlichen/privaten VAPID-Schlüssel in `config.php` eintragen und eine gültige eigene Kontaktadresse unter `vapid_subject` hinterlegen. Den privaten Schlüssel nicht veröffentlichen.
3. In Plesk eine geplante Aufgabe **jede Minute** unter dem Subscription-Benutzer einrichten:

   ```sh
   /opt/plesk/php/8.3/bin/php /ABSOLUTER/PFAD/palle/bin/reminders.php
   ```

   Cron-Ausdruck: `* * * * *`. Die PHP-Logik verwendet Europe/Berlin unabhängig von der Serverzeitzone. Der Dienst bündelt Aufgaben und verhindert wiederholte Zustellung desselben Hinweises an dasselbe Gerät. Push-Dienst-Ausfälle werden protokolliert; die Uhrzeit ist ein Versandzeitpunkt, keine Garantie für sofortige Anzeige durch iOS.
4. Palle über sein Home-Bildschirm-Symbol starten und unter Einstellungen → Mitteilungen aktivieren zustimmen. Bei Safari auf iOS ist diese Installation Voraussetzung für Web-Push. Auf jedem weiteren Gerät separat aktivieren. Über „Testnachricht senden“ lässt sich eine echte Pushnachricht vom Server an das aktuelle Gerät schicken. Die Bestätigung bedeutet, dass der Push-Dienst die Nachricht angenommen hat; die Anzeige hängt zusätzlich von den Geräteeinstellungen ab. Testnachrichten sind auf eine je 15 Sekunden pro Sitzung begrenzt.

## Fotos & laufende Dokumentationen

„Dokumentation starten“ legt sofort einen offenen Datensatz an. Die laufende Dokumentation findet sich unter „Heute → In Arbeit“ und in der Geräteakte. Ein Notizentwurf wird beim Tippen lokal gesichert. „Notiz hinzufügen“ erzeugt einen Eintrag mit Zeitstempel. Fotos erzeugen weitere Einträge, auch ohne Text. Beim Abschluss wird ein noch vorhandener Notizentwurf mit übernommen.

Direkte Kameraaufnahme: ein Foto aufnehmen, danach bei Bedarf erneut „Foto machen“. Mediathek: mehrere Fotos gleichzeitig auswählen. Es gibt keine feste Anzahlgrenze in Palle; verfügbarer Geräte- und Serverspeicher begrenzen die Menge. JPEG, PNG und WebP werden verarbeitet. Falls Safari eine HEIC-Datei nicht dekodieren kann, gibt Palle eine Fehlermeldung; dann das Foto als JPEG verwenden. Eine Datei darf vor Verarbeitung maximal 30 MB groß sein.

Eine Dokumentation bleibt auch über einen Schichtwechsel hinaus offen. Die Zuordnung bleibt zunächst bei der Schicht, in der sie begonnen wurde, und kann geändert werden. Palle erfasst keine einzelnen Aufgabenzeiten.

## Offline & parallele Nutzung

Nach dem ersten erfolgreichen Laden ist die App-Oberfläche offline verfügbar. Datensätze und neue Fotos werden lokal gespeichert und später synchronisiert. Kameraaufnahme und Mediathek funktionieren unabhängig vom Server; der Barcode-Scanner benötigt zusätzlich Kameraerlaubnis und HTTPS.

Die Statusanzeige unterscheidet „Lokal gesichert · ausstehend“ von „Auf Server gespeichert“. Erst Letzteres bedeutet, dass die Serverfassung aktualisiert wurde. Bitte Safari-/Website-Daten nicht löschen, solange Änderungen ausstehen. Bei abgelaufener Anmeldung bleiben lokale Änderungen erhalten; nach erneutem Login werden sie übertragen.

Wenn ein anderes Gerät bereits Änderungen gespeichert hat, wird eine Konfliktmeldung angezeigt. Vor Übernahme des Serverstands die lokale Sicherung herunterladen. Ein automatisches Zusammenführen unterschiedlicher Fassungen ist in Version 1 nicht enthalten. Einstellungen → „Serverstand neu laden“ aktualisiert die Ansicht; beim Zurückkehren in die App wird ein neuer Serverstand automatisch geladen, sofern keine lokalen Änderungen offen sind.

## Sicherung & Wartung

Plesk-Backups für **Datenbank, storage/photos und config.php** zusammen einrichten. Datenbank und Fotos gehören zur selben Sicherung. Zusätzlich kann Palle eine JSON-Datei inklusive Fotos herunterladen. Die JSON-Sicherung dient auch als lesbarer Notfallexport; ein Import über die App ist noch nicht enthalten.

Passwort ändern:

```sh
/opt/plesk/php/8.3/bin/php bin/password.php DEIN_BENUTZERNAME
```

Vorhandene Sitzungen werden dabei ungültig. Lokal ausstehende Daten werden bei der nächsten Anmeldung wieder angeboten.

Bei Updates Versionsname in `public/sw.js` erhöhen (oder `bin/deploy.php` ausführen), damit ein neuer App-Cache angelegt wird. Unter Einstellungen → App-Updates kann nach einer neuen Version gesucht und diese ausdrücklich geladen werden. Vor dem Neuladen werden lokale Änderungen und offene Notizentwürfe gesichert; IndexedDB und Fotos werden dabei nicht gelöscht. Beim erneuten Sichtbarwerden der App wird ebenfalls nach Updates gesucht. Für den erstmaligen Wechsel von einer älteren App ohne Updatesuche alle Palle-Fenster einschließlich Safari schließen und Palle neu öffnen. Fotos sind privat außerhalb des Web-Stammverzeichnisses; nicht referenzierte Uploads werden nicht automatisch gelöscht, um bei Synchronisierungsabbrüchen keine Bilder zu verlieren.

## Lokale Entwicklung & Prüfungen

Node 24+, pnpm. Der Serverbetrieb benötigt Node nicht.

```sh
pnpm install
pnpm test
node scripts/check-php.mjs
PLAYWRIGHT_BROWSERS_PATH=work/browsers pnpm exec playwright install chromium
PLAYWRIGHT_BROWSERS_PATH=work/browsers pnpm run test:browser
pnpm run preview
```

Vorschau: `http://127.0.0.1:4173/?preview=1`. Daten bleiben nur in diesem Browser. Die Vorschau aktiviert **keine** Serveranmeldung oder Push-Zustellung und ist klar gekennzeichnet.

Die Browserprüfung verwendet denselben PHP-API-Code mit PHP 8.3 in WebAssembly und einer isolierten SQLite-Testdatenbank. MySQL/MariaDB, iPhone-Kamera, echte Barcode-Etiketten und die Push-Zustellung müssen nach Installation auf Plesk/iPhone zusätzlich geprüft werden.

## Technische Referenzen

- [Apple/WebKit: Web-Push für Home-Bildschirm-Web-Apps](https://webkit.org/blog/13878/)
- [MDN: Kameraaufnahme mit capture](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Attributes/capture)
- [PHP: sichere Sitzungseinstellungen](https://www.php.net/manual/en/session.security.ini.php)
- [ZXing Browser: Barcode-Scanner](https://github.com/zxing-js/browser)
- [Web-Push-PHP: Bibliothek und VAPID](https://github.com/web-push-libs/web-push-php)

## Automatische Updates über Git/Plesk

Repository: [yanickc06/palle-lagerbuddy](https://github.com/yanickc06/palle-lagerbuddy).

Die [Git-/Plesk-Anleitung](docs/PLESK-GIT.md) beschreibt Branch `main`, Deploy-Key, Webhook und zusätzliche Deployment-Aktionen für `palle.conya.de`. `bin/deploy.php` prüft das Schema ohne Zurücksetzen der Arbeitsdaten und aktualisiert die PWA-Cache-Version automatisch anhand der ausgelieferten Dateien. Zugangsdaten und Laufzeitdateien bleiben außerhalb von Git.
