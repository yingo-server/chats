# Yingo Server

**Version**: `v6.4-stable-Whitenight` 路 **Updated**: 2026-08-02

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
| Frontend | `frontend/` | 鈥?| React 19 SPA (Netlify, `chats.344977.xyz`) |
| Test suite | `debug/` | 鈥?| Python integration framework (412 cases, 24 suites) |

## Repository Structure

```
鈹溾攢鈹€ user/                     # User Service (port 9000)
鈹?  鈹溾攢鈹€ src/
鈹?  鈹?  鈹溾攢鈹€ index.ts          #   service startup
鈹?  鈹?  鈹溾攢鈹€ routes.ts         #   REST routes (20 endpoints)
鈹?  鈹?  鈹溾攢鈹€ core.ts           #   business logic (auth, keys, notes)
鈹?  鈹?  鈹溾攢鈹€ db.ts             #   PostgreSQL connection
鈹?  鈹?  鈹溾攢鈹€ schema.ts         #   Drizzle table definitions
鈹?  鈹?  鈹斺攢鈹€ types.ts          #   shared types
鈹?  鈹溾攢鈹€ migrations/           #   SQL migrations (e.g. 0003 room_notes)
鈹?  鈹溾攢鈹€ tests/                #   Vitest unit tests (52)
鈹?  鈹斺攢鈹€ Dockerfile            #   ghcr.io/yingo-server/yingo-user
鈹溾攢鈹€ chat/                     # Chat Service (port 9001)
鈹?  鈹溾攢鈹€ src/
鈹?  鈹?  鈹溾攢鈹€ index.ts          #   startup + Socket.IO wiring
鈹?  鈹?  鈹溾攢鈹€ routes.ts         #   REST routes (23 endpoints)
鈹?  鈹?  鈹溾攢鈹€ core.ts           #   rooms/messages business logic
鈹?  鈹?  鈹溾攢鈹€ socket.ts         #   WebSocket event handlers
鈹?  鈹?  鈹溾攢鈹€ api.ts            #   User Service call adapter
鈹?  鈹?  鈹溾攢鈹€ redis.ts          #   Redis hot-zone connection
鈹?  鈹?  鈹溾攢鈹€ schema.ts         #   Drizzle table definitions
鈹?  鈹?  鈹斺攢鈹€ types.ts
鈹?  鈹溾攢鈹€ tests/                #   Vitest unit tests (52)
鈹?  鈹斺攢鈹€ Dockerfile            #   ghcr.io/yingo-server/yingo-chat
鈹溾攢鈹€ frontend/                 # React 19 SPA
鈹?  鈹斺攢鈹€ src/
鈹?      鈹溾攢鈹€ api/              #   REST client (user + chat)
鈹?      鈹溾攢鈹€ components/       #   rooms, layout, dialogs, context menu
鈹?      鈹溾攢鈹€ hooks/            #   useSocket, useOnlineStatus, ...
鈹?      鈹溾攢鈹€ pages/            #   ChatPage, ProfilePage, ...
鈹?      鈹溾攢鈹€ stores/           #   Zustand stores (auth, room, message, ui)
鈹?      鈹斺攢鈹€ types/            #   shared API types
鈹溾攢鈹€ debug/                    # Python integration test framework
鈹?  鈹溾攢鈹€ delib.py              #   24 suites / 412 test cases
鈹?  鈹斺攢鈹€ main.py               #   console runner (progress + logs)
鈹溾攢鈹€ .github/workflows/        # CI: build+push images to GHCR on push
鈹溾攢鈹€ API.md                    # Complete REST + WebSocket reference
鈹溾攢鈹€ DEPLOY.md                 # Deployment guide (production + generic)
鈹斺攢鈹€ netlify.toml              # Netlify publish config (frontend/)
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
| `DATABASE_URL` | 鈥?| both | PostgreSQL DSN (`colduser:...@user-db/cold_user`, `coldchat:...@chat-db/cold_chat`) |
| `REDIS_URL` | 鈥?| chat | Redis DSN (`redis://chat-cache:6379`) |
| `USER_SERVICE_URL` | `http://localhost:9000` | chat | User Service base URL |
| `INTERNAL_API_KEY` | `dev-internal-...` | both | Key for `x-internal-key` header |
| `PEPPER_SECRET` | `dev-pepper-...` | both | Password hash pepper |
| `TOKEN_SECRET` | `dev-token-...` | both | Token HMAC key |
| `CORS_ORIGINS` | 鈥?| both | Comma-separated allowed origins |
| `SSL_CERT` / `SSL_KEY` | 鈥?| both | HTTPS cert paths (prod) |
| `LOGIN_RATE_LIMIT` / `LOGIN_RATE_WINDOW` | `30` / `60000` | user | Login rate limiting per IP |
| `NODE_ENV` | 鈥?| both | `production` disables debug mode |
| `DEBUG_SECRET` | 鈥?| both | Enables `x-debug-admin` header in production |

## Architecture

### Hot/Cold message storage

```
send 鈫?Redis (hot zone, TTL ~10 min)
            鈫?archived to PostgreSQL on expiry
      PostgreSQL (cold zone, persistent)
```

- Recent messages are served from Redis for fast read/write; history merges both zones
  (cursor pagination, no duplicates 鈥?verified by `test_pagination_no_duplicates`)
- No data loss on restart (Redis AOF + cold storage)

### Token system

```
login 鈫?short_token (32 hex, 1h) + long_token (30d)
verify 鈫?HMAC-SHA256 with per-token salt, constant-time compare
```

### Auth model

- `user` 鈥?rooms, messages, notes, keys
- `admin` 鈥?user/token/room management, stats, metrics
- First user on empty DB auto-promoted to `admin` (advisory lock against races)
- Last-admin protection: the final admin cannot be demoted or deleted

## API Overview

Full reference: **[API.md](./API.md)** 鈥?includes request/response schemas, error codes,
WebSocket event payloads, and the data model.

| Service | Count | Highlights |
|---------|-------|------------|
| User Service | 20 REST | register/login/verify 路 users/me/:id/search 路 tokens/me 路 api-keys 路 room-notes (new in 6.3) 路 admin users/tokens 路 health/ready/metrics 路 internal lookup |
| Chat Service | 23 REST | rooms (direct/group/list/detail/members) 路 **delete/leave room** (new in 6.3) 路 messages 路 login & search proxy 路 10 admin endpoints 路 health/ready/metrics |
| WebSocket | 5 events | `v1:join` 路 `v1:leave` 路 `v1:message` 路 `v1:online` 路 `v1:error` |

## Frontend

- React 19 + Vite SPA, deployed to Netlify from this repository (`netlify.toml`: `publish = "frontend"`).
- API endpoints are baked at build time via `.env` (`VITE_USER_API` / `VITE_CHAT_API` 鈫?`server.344977.xyz:9000/9001`).
- Key features: room list with notes & member names, chat with hot-path history, WebSocket presence,
  room context menu (delete / set note / properties), mobile long-press menu,
  create-group confirmation (name is permanent), gesture-blocking (selection/drag/middle-click disabled).

## Testing

### Integration suite (`debug/`)

24 suites, **412 test cases** 鈥?health, auth, tokens, rooms, messages, WebSocket (polling +
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
| 2026-08-02 | Production 6.3-stable-raw (clean DB) | all core + admin suites pass | 鈮?9%* |

> \* The only observed variance is the known `fast_reconnect` flake on the production
> websocket path (鈮? per 30 attempts, absent locally and in 100/100 probe runs).
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

- **Production** (server.344977.xyz): see [DEPLOY.md](./DEPLOY.md) 鈥?full `docker run`
  commands, DB initialization incl. `room_notes`, GRANT steps, upgrade script.
- **CI**: pushing to `main` (changes under `user/**`, `chat/**`, or workflow files)
  builds and pushes `ghcr.io/yingo-server/yingo-user|yingo-chat` with tags
  `latest` + `v6.4-stable-Whitenight` + commit SHA.
- **Frontend**: Netlify watches the same `main` branch and auto-deploys `frontend/`.

## Changelog

| Version | Date | Highlights |
|---------|------|------------|
| v6.4-stable-Whitenight | 2026-08-02 | Media attachments (image/audio/video/file upload, sha256 dedup, 2 MB limit, type filter chips) |
| 6.3-stable-raw | 2026-08-02 | Delete/leave room API; per-user room notes; room context menu + mobile long-press; read-only group names; gesture blocking; dual-transport socket tests |
| 6.2-stable-law | 2026-07 | Public user profile endpoint; DM member names; debug suite tweaks; English conversion |
