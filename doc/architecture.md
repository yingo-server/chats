# Architecture

## Service Topology

```
client (React SPA)
   │  HTTPS / WSS
   ▼
chat-service (Fastify + Socket.IO, :9001)
   │  x-internal-key (chat/src/api.ts)
   ▼
user-service (Fastify, :9000)
   │
   ├─ PostgreSQL 16 (cold_user)
   ├─ PostgreSQL 16 (cold_chat)      ← owned by chat-service
   └─ Redis 7 (chat-cache)           ← owned by chat-service
```

**Isolation rule**: the Chat Service reaches the User Service only through
`chat/src/api.ts` (`GET /api/v1/internal/user/:id` with the `x-internal-key`
header). There is no shared database access between the two services.

## Repositories

| Path | Role |
|------|------|
| `user/src/index.ts` | Fastify bootstrap, HTTPS, CORS, helmet, graceful shutdown |
| `user/src/routes.ts` | REST routes (19 + health/ready/metrics) |
| `user/src/core.ts` | Business logic: registration, login, tokens, API keys, permissions, room notes |
| `user/src/schema.ts` | Drizzle table definitions |
| `user/src/db.ts` | PostgreSQL connection (wait-for-db retry) |
| `chat/src/index.ts` | Fastify bootstrap + Socket.IO wiring + archiver + online-key cleanup |
| `chat/src/routes.ts` | REST routes (29 + health/ready/metrics) |
| `chat/src/core.ts` | Rooms/messages/media logic, hot/cold hybrid reads |
| `chat/src/socket.ts` | WebSocket event handlers |
| `chat/src/api.ts` | User Service adapter, token verification, rate limiting |
| `chat/src/redis.ts` | Redis connection |
| `chat/src/video.ts` | ffmpeg 480p transcoding |
| `chat/src/utils.ts` | Media validation/classification, message sanitizing |
| `chat/src/schema.ts` | Drizzle table definitions |
| `frontend/` | React 19 SPA (Zustand stores, socket hook, shadcn-style components) |
| `debug/` | Python integration suite |

## Hot / Cold Message Storage

```
send ──> Redis hot zone (hot:msg:<id>, TTL 10 min)
             └─> archiver (every 5 s): Redis ──> PostgreSQL cold zone
                                      (on TTL expiry or idling)
  reads: hot messages + cold messages, merged, cursor paginated,
         sorted by id descending, deduplicated (hot:room:<id> index)
```

- New messages are written to Redis first (`SET NX` with collision retry) and
  re-written after the inter-message interval is computed.
- If Redis is unavailable at send time, the message is written directly to
  PostgreSQL so it is never lost.
- The archiver moves hot messages into `cold_messages` and removes them from
  the hot index; failures are logged and retried on the next tick.
- History reads fill from the hot zone first and fetch the remaining quota
  from PostgreSQL.

## Token System

```
login ──> short_token (32 hex, 1 h) + long_token (64 hex, 30 d)
verify ─> HMAC-SHA256(token_secret, salt + token), constant-time compare
lookup ─> SHA-256(token) stored in token_lookup / short_lookup for index scans
```

- Tokens are stored as salted HMAC hashes; raw values are never stored.
- Verification results are cached in memory (10 s TTL, max 50 000 entries)
  and invalidated immediately after permission changes, revocations or
  deletions.
- Expired and revoked tokens are purged by a background cleaner.

## Auth Model

- `user` — rooms, messages, notes, API keys.
- `admin` — user/token/room/media management, stats, metrics.
- First user on an empty DB auto-promotes to `admin` (transaction +
  `pg_advisory_xact_lock(424242)` makes the decision race-free).
- `ADMIN_USERNAME` optionally grants admin to a specific username at
  registration.
- Last-admin protection: the final admin cannot be demoted or deleted; admins
  cannot demote/delete themselves.

## Presence

- Each connection refreshes `online:<userId>` in Redis (TTL 120 s, debounced
  to 5 s).
- Multi-device: a user stays online until their last socket disconnects.
- Joining a room broadcasts `v1:online`; leaving/disconnect broadcasts offline.
- On startup, stale `online:*` keys are cleared with SCAN (never KEYS).

## Media Pipeline

```
upload (data URL) ─> validate (MIME allow-list, ≤ 30 MB)
                  ─> video? ffmpeg 480p (H.264/AAC/MP4, 45 s timeout; fallback = original)
                  ─> sha256 ─> dedup (unique index, idempotent)
                  ─> bytea storage
```

See [Media](./media.md) for details.

## Rate Limiting

- Login: in-memory per-IP counter (default 30 / 60 s).
- Socket messages: Redis `ratelimit:msg:<uid>` (60 / 10 s).
- API keys: per-key `rate_limit` column (default 100 req/min).

## Shutdown & Failure Handling

- SIGINT/SIGTERM trigger graceful shutdown (8 s force-exit watchdog).
- `uncaughtException` / `unhandledRejection` log fatally and exit(1).
- Startup verifies Redis and PostgreSQL (10 retries) before listening.
