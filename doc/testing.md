# Testing

Two layers: a Python integration suite that exercises the full system against
running services, and Vitest unit suites in `user/` and `chat/`.

## Integration Suite (`debug/`)

25 suites / **485 test cases** covering health, auth, tokens, API keys, rooms,
messages, media, WebSocket (both polling and websocket transports), admin
endpoints, concurrency, edge cases, permission matrix, burst traffic, large
data and resilience.

### Run

```powershell
# Local
$env:CLOUD_MODE="0"; $env:USER_BASE="http://localhost:9000"; $env:CHAT_BASE="http://localhost:9001"
python debug/main.py

# Production (defaults: server.344977.xyz, CLOUD_MODE=1)
python debug/main.py

# Selected suites
python debug/main.py "Room Management" "Media" "Permission Matrix"
```

Or double-click `debug/run-tests.bat` (logs to
`%USERPROFILE%\Desktop\yingo_<timestamp>.log`).

### Behavior

- `CLOUD_MODE=1` skips the local Docker database reset; cleanup happens
  through the admin API after the run.
- `CLOUD_MODE=0` truncates local `cold_user` / `cold_chat` tables and flushes
  Redis before the run.
- Suites run each test function up to 3 times (polling socket variants run
  once and are best-effort — the production client uses websocket only).
- Output is progress bars + failures-only details; full logs in
  `debug/logs/`.

### Suites

| Suite | Focus |
|-------|-------|
| Health Checks | liveness/readiness/metrics |
| User Registration / Login | validation, duplicate handling |
| Token Verification / Lifecycle | token validity, fast reconnect |
| User Queries | profiles, search |
| API Keys | creation, scopes, expiry |
| Room Management | direct/group lifecycle, membership |
| Message Send/Receive | text and media messages |
| Media | upload/dedup/raw/filter/delete/oversize/transcode |
| Admin – Chat / Admin – User | admin endpoints, last-admin protection |
| Cross-Service Calls | internal lookup, proxies |
| Concurrency | parallel register/login/rooms/messages |
| Edge Cases | malformed input, method not allowed, empty bodies |
| Socket.IO | join/leave/message/online/error over both transports |
| Content Safety | length limits |
| Online Status | presence transitions |
| Burst Traffic | 100-message bursts, batch operations |
| Resource Lifecycle | rapid create/delete loops |
| WebSocket Multi-Client | 100 concurrent clients |
| Data Consistency | permission consistency under concurrency |
| Large Data | big payloads, pagination |
| System Resilience | service readiness under load |
| Permission Matrix | nodebug/admin/user matrix |

### Latest Local Results

| Date | Result | Pass rate |
|------|--------|-----------|
| 2026-08-03 | 485/485 | 100% |

## Unit Tests

```bash
cd user && npm test     # Vitest
cd chat && npm test     # Vitest
npm run typecheck       # in each service
```

Frontend quality gates: `npm run lint` (oxlint) and `npm run build`
(tsc + vite).
