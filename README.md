# Privater Betriebsüberblick

Python-Standardbibliothek, mobile Oberfläche auf Deutsch, lokale SVG-Diagramme ohne CDN. Dieses Repository enthält ausschließlich Code. Geschäftsdaten kommen über einen privaten Collector.

## Start

Erforderliche Umgebungsvariablen: `DASH_PASSWORD`, `DASH_SESSION_SALT`, `DASH_PUSH_TOKEN`. Keine Standardwerte; fehlende Werte verhindern den Start. Werte außerhalb des Repositories verwalten. `python server.py` startet Port 8080; `PORT`, `DASH_BIND` und `DASH_DATA_DIR` sind optional.

Vor die Anwendung gehört ein HTTPS-Reverse-Proxy. Sitzungs-Cookies sind immer Secure, HttpOnly und SameSite=Strict und laufen nach 14 Tagen ab. Der Zugangscode wird mit einem maskierten Textfeld abgefragt. Der fünfte fehlgeschlagene Versuch je Peer-IP innerhalb von zehn Minuten liefert 429. Hinter einem Reverse-Proxy teilen Besucher dessen Peer-IP-Limit; ungesicherte X-Forwarded-For-Header werden bewusst ignoriert. Eine Code- oder Salt-Änderung entwertet bestehende Sitzungen.

`GET /healthz` ist öffentlich und liefert `ok`. `POST /login` akzeptiert URL-kodierte Formulardaten (`dm-overview-access-code`); `POST /logout` löscht das Cookie. `GET /api/data` und alle App-Dateien benötigen eine gültige Sitzung. `POST /api/ingest` benötigt `Authorization: Bearer <DASH_PUSH_TOKEN>` und ein JSON-Objekt mit `as_of`. Der Collector liefert die Objekte `revenue`, `gpu`, `traffic`, `kpis`, `source_status`. Das Ingest-Limit beträgt 8 MiB. JSON wird mit privaten Dateirechten atomar in `/data/snapshot.json` gespeichert; ist `/data` beim Start nicht beschreibbar, dient `/tmp/dm-overview/snapshot.json` als Ersatz. Für dauerhafte Daten ein beschreibbares Volume unter `/data` einhängen (UID 10001).

Der Prozess braucht Zugriff nur auf sein Datenverzeichnis und keine Datenbank- oder Anbieter-Zugangsdaten. Eine Momentaufnahme kann Kundennamen enthalten; deshalb weder Datenvolume noch Collector noch Screenshots in dieses Repository aufnehmen. Die Anwendung interpretiert Datentexte ausschließlich über `textContent` bzw. SVG-Textknoten.

## Daten und Grenzen

Oberfläche zeigt tatsächliche Netto-Wallet-Aufladungen separat von einer bedingten Monats-Hochrechnung. Kunden-IDs aus Umsatz und Gateway sind unterschiedlich: nur eindeutige Namensübereinstimmungen werden verbunden; übrige erscheinen als nicht zugeordnet. GPU-SM-Auslastung fehlt in der Quelle und wird nicht erfunden. Live-Billing kann Forschung einschließen, die Flottentabelle nur den ausgewiesenen Bestand. Quelle und Datenstand bleiben sichtbar.

Der private Collector und die nicht installierten systemd-Units werden getrennt vom öffentlichen Repository ausgeliefert.
