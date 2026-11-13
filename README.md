# ops-overview-dashboard

Private operations cockpit (code only — no data, no customer information lives in this repository).

- `server.py` — Python stdlib server: password login (signed HttpOnly session cookie, rate-limited), bearer-token
  snapshot ingest (`POST /api/ingest`), authenticated `GET /api/data`, strict CSP (self only).
  `/healthz` answers `ok`, or `ok empty` when no snapshot is loaded yet (so the private collector re-pushes after a redeploy).
- `static/` — vanilla JS + SVG cockpit: status verdict, KPI strip, sections for money, traffic, capacity, models and operations.
  Light/dark themes, mobile-first, no external code.
- Data is produced by a private collector elsewhere that reads only read-only sources and pushes a JSON snapshot
  (schema `cockpit/2`) including its own history.

Env: `DASH_PASSWORD`, `DASH_SESSION_SALT`, `DASH_PUSH_TOKEN` (required), `DASH_DATA_DIR` (default `/data`, falls back to tmp).

Card ages describe successful source reads (cached producers retain their own read timestamps).
The private collector keeps model ownership in a single explicit config, diagnoses latency per
model/account, and sends filesystem paths and sizes for the server storage card. A quiet event
stream is fresh after a successful read; event times remain separate metadata.
