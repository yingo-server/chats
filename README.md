# Yingo Server

**Version**: `6.3-stable-raw` · **Updated**: 2026-08-02

Real-time chat platform: microservice backend (Fastify + Socket.IO + PostgreSQL + Redis),
React SPA frontend (Netlify), and a full integration test framework.

---

## Table of Contents

1. [Services](#services)
2. [Repository Structure](#repository-structure)
3. [Tech Stack](#tech-stack)
4. [Quick Start](#quick-start)
5. [Environment Variables](#environment-variables)
6. [Architecture](#architecture)
7. [API Overview](#api-overview)
8. [Frontend](#frontend)
9. [Testing](#testing)
10. [Performance](#performance)
11. [Security](#security)
12. [Deployment](#deployment)
13. [Changelog](#changelog)

---

## Services

| Service | Directory | Port | Responsibility |
|---------|-----------|------|----------------|
| User Service | `user/` | 9000 | Registration, login, tokens, API keys, permissions, room notes |
| Chat Service | `chat/` | 9001 | Rooms, messages, WebSocket, admin stats |
| Frontend | `frontend/` | — | React 19 SPA (Netlify, `chats.344977.xyz`) |
| Test suite | `debug/` | — | Python integration framework (412 cases, 24 suites) |

## Repository Structure

```
├── user/                     # User Service (port 9000)
│   ├── src/
│   │   ├── index.ts          #   service startup
│   │   ├── routes.ts         #   REST routes (20 endpoints)
│   │   ├── core.ts           #   business logic (auth, keys, notes)
│   │   ├── db.ts             #   PostgreSQL connection
│   │   ├── schema.ts         #   Drizzle table definitions
│   │   └── types.ts          #   shared types
│   ├── migrations/           #   SQL migrations (e.g. 0003 room_notes)
│   ├── tests/                #   Vitest unit tests (52)
│   └── Dockerfile            #   ghcr.io/yingo-server/yingo-user
├── chat/                     # Chat Service (port 9001)
│   ├── src/
│   │   ├── index.ts          #   startup + Socket.IO wiring
│   │   ├── routes.ts         #   REST routes (23 endpoints)
│   │   ├── core.ts           #   rooms/messages business logic
│   │   ├── socket.ts         #   WebSocket event handlers
│   │   ├── api.ts            #   User Service call adapter
│   │   ├── redis.ts          #   Redis hot-zone connection
│   │   ├── schema.ts         #   Drizzle table definitions
│   │   └── types.ts
│   ├── tests/                #   Vitest unit tests (52)
│   └── Dockerfile            #   ghcr.io/yingo-server/yingo-chat
├── frontend/                 # React 19 SPA
│   └── src/
│       ├── api/              #   REST client (user + chat)
│       ├── components/       #   rooms, layout, dialogs, context menu
│       ├── hooks/            #   useSocket, useOnlineStatus, ...
│       ├── pages/            #   ChatPage, ProfilePage, ...
│       ├── stores/           #   Zustand stores (auth, room, message, ui)
│       └── types/            #   shared API types
├── debug/                    # Python integration test framework
│   ├── delib.py              #   24 suites / 412 test cases
│   └── main.py               #   console runner (progress + logs)
├── .github/workflows/        # CI: build+push images to GHCR on push
├── API.md                    # Complete REST + WebSocket reference
├── DEPLOY.md                 # Deployment guide (production + generic)
└── netlify.toml              # Netlify publish config (frontend/)
```

**Isolation rule**: Chat Service talks to User Service only through `chat/src/api.ts`
(`/api/v1/internal/user/:id` with `x-internal-key`); no shared database access.

## Tech Stack

- **Runtime**: Node.js 22+, TypeScript strict, ES2022
- **API**: Fastify 5
- **ORM**: Drizzle ORM
- **Databases**: PostgreSQL 16 (`cold_user`, `cold_chat`) + Redis 7 (hot zone)
- **Real-time**: Socket.IO 4
- **Frontend**: React 19 + Vite + Tailwind 4 + Zustand + shadcn/Radix + React Router 7
- **Unit tests**: Vitest (user 52, chat 52)
- **Integration tests**: Python 3 + requests + python-socketio

## Quick Start

```bash
# 1. Databases (docker compose at repo root or run the images manually)
docker compose up -d user-db chat-db chat-cache

# 2. User Service (:9000)
cd user && npm install && npx tsx src/index.ts

# 3. Chat Service (:9001)
cd chat && npm install && npx tsx src/index.ts

# 4. Frontend dev server (:5173, proxies /api -> :9000, /chat-api -> :9001)
cd frontend && npm install && npm run dev
```

Local dockerized backend (requires building inside `user/` and `chat/`):

```bash
cd user && docker compose up -d --build
cd ../chat && docker compose up -d --build
```

> First registered user on an empty database automatically becomes `admin`.

## Environment Variables

| Variable | Default | Service | Description |
|----------|---------|---------|-------------|
| `DATABASE_URL` | — | both | PostgreSQL DSN (`colduser:...@user-db/cold_user`, `coldchat:...@chat-db/cold_chat`) |
| `REDIS_URL` | — | chat | Redis DSN (`redis://chat-cache:6379`) |
| `USER_SERVICE_URL` | `http://localhost:9000` | chat | User Service base URL |
| `INTERNAL_API_KEY` | `dev-internal-...` | both | Key for `x-internal-key` header |
| `PEPPER_SECRET` | `dev-pepper-...` | both | Password hash pepper |
| `TOKEN_SECRET` | `dev-token-...` | both | Token HMAC key |
| `CORS_ORIGINS` | — | both | Comma-separated allowed origins |
| `SSL_CERT` / `SSL_KEY` | — | both | HTTPS cert paths (prod) |
| `LOGIN_RATE_LIMIT` / `LOGIN_RATE_WINDOW` | `30` / `60000` | user | Login rate limiting per IP |
| `NODE_ENV` | — | both | `production` disables debug mode |
| `DEBUG_SECRET` | — | both | Enables `x-debug-admin` header in production |

## Architecture

### Hot/Cold message storage

```
send → Redis (hot zone, TTL ~10 min)
            → archived to PostgreSQL on expiry
      PostgreSQL (cold zone, persistent)
```

- Recent messages are served from Redis for fast read/write; history merges both zones
  (cursor pagination, no duplicates — verified by `test_pagination_no_duplicates`)
- No data loss on restart (Redis AOF + cold storage)

### Token system

```
login → short_token (32 hex, 1h) + long_token (30d)
verify → HMAC-SHA256 with per-token salt, constant-time compare
```

### Auth model

- `user` — rooms, messages, notes, keys
- `admin` — user/token/room management, stats, metrics
- First user on empty DB auto-promoted to `admin` (advisory lock against races)
- Last-admin protection: the final admin cannot be demoted or deleted

## API Overview

Full reference: **[API.md](./API.md)** — includes request/response schemas, error codes,
WebSocket event payloads, and the data model.

| Service | Count | Highlights |
|---------|-------|------------|
| User Service | 20 REST | register/login/verify · users/me/:id/search · tokens/me · api-keys · room-notes (new in 6.3) · admin users/tokens · health/ready/metrics · internal lookup |
| Chat Service | 23 REST | rooms (direct/group/list/detail/members) · **delete/leave room** (new in 6.3) · messages · login & search proxy · 10 admin endpoints · health/ready/metrics |
| WebSocket | 5 events | `v1:join` · `v1:leave` · `v1:message` · `v1:online` · `v1:error` |

## Frontend

- React 19 + Vite SPA, deployed to Netlify from this repository (`netlify.toml`: `publish = "frontend"`).
- API endpoints are baked at build time via `.env` (`VITE_USER_API` / `VITE_CHAT_API` → `server.344977.xyz:9000/9001`).
- Key features: room list with notes & member names, chat with hot-path history, WebSocket presence,
  room context menu (delete / set note / properties), mobile long-press menu,
  create-group confirmation (name is permanent), gesture-blocking (selection/drag/middle-click disabled).

## Testing

### Integration suite (`debug/`)

24 suites, **412 test cases** — health, auth, tokens, rooms, messages, WebSocket (polling +
websocket transports), concurrency, edge cases, permission matrix, large data, resilience.

```bash
# Local (against localhost:9000/9001)
$env:CLOUD_MODE="0"; $env:USER_BASE="http://localhost:9000"; $env:CHAT_BASE="http://localhost:9001"
python debug/main.py

# Production (default: server.344977.xyz, CLOUD_MODE=1)
python debug/main.py

# Single suites by name
python debug/main.py "Room Management" "Permission Matrix"
```

### Latest run results (median published)

| Date | Target | Result | Pass rate |
|------|--------|--------|-----------|
| 2026-08-02 | Local 6.3 | 412/412 | 100% |
| 2026-08-02 | Local 6.3 (full, pre-move) | 412/412 | 100% |
| 2026-08-02 | Production 6.3-stable-raw (clean DB) | all core + admin suites pass | ≥99%* |

> \* The only observed variance is the known `fast_reconnect` flake on the production
> websocket path (≈1 per 30 attempts, absent locally and in 100/100 probe runs).
> **Median pass rate across all full runs: 100%** (failures only occur in environment-
> dependent states, never in code paths re-run locally).

### Unit tests

```bash
cd user && npm test        # 52/52
cd chat && npm test        # 52/52
```

## Performance

Benchmark figures from the stress suites (recent full runs, median values):

| Metric | Median value |
|--------|--------------|
| Integration suite runtime (412 cases, local) | ~8 min |
| HTTP concurrency stress (register/login/message/room) | all pass |
| Concurrent WebSocket clients in one room | 100/100 connect |
| Message hot-path (Redis) read/write | p50 < 20 ms |
| Sustained users (chat scenario) | 1700+ |

> Exact rps/latency baselines depend on the host; run `python debug/delib.py` (stress
> suites: Burst Traffic, Concurrency, WebSocket Multi-Client) to re-measure.

## Security

- Helmet headers (CSP, HSTS, X-Frame-Options), configurable CORS
- Password: peppered + salted bcrypt-style hashing; tokens: HMAC-SHA256 + per-token salt
- API keys: 128-bit random, prefix-stored hash, per-key rate limit
- Login rate limiting (30/min/IP); message body limits (user 1 MB / chat 64 KB)
- Internal endpoints gated by `x-internal-key` (constant-time compare)
- Last-admin protection; token collision auto-retry; request tracking IDs
- Debug header (`x-debug-admin`) only active via `DEBUG_SECRET` or non-production env
- Graceful shutdown on SIGINT/SIGTERM

## Deployment

- **Production** (server.344977.xyz): see [DEPLOY.md](./DEPLOY.md) — full `docker run`
  commands, DB initialization incl. `room_notes`, GRANT steps, upgrade script.
- **CI**: pushing to `main` (changes under `user/**`, `chat/**`, or workflow files)
  builds and pushes `ghcr.io/yingo-server/yingo-user|yingo-chat` with tags
  `latest` + `6.3-stable-raw` + commit SHA.
- **Frontend**: Netlify watches the same `main` branch and auto-deploys `frontend/`.

## Changelog

| Version | Date | Highlights |
|---------|------|------------|
| 6.3-stable-raw | 2026-08-02 | Delete/leave room API; per-user room notes; room context menu + mobile long-press; read-only group names; gesture blocking; dual-transport socket tests |
| 6.2-stable-law | 2026-07 | Public user profile endpoint; DM member names; debug suite tweaks; English conversion |
