# Yingo Server

Real-time chat backend system with a microservice architecture. Fastify + Socket.IO + PostgreSQL + Redis.

## Services

| Service | Port | Responsibility |
|---------|------|----------------|
| `user/` | 9000 | User registration, login, tokens, permission management |
| `chat/` | 9001 | Real-time messages, rooms, WebSocket |
| `frontend/` | - | Static SPA frontend (Netlify) |
| `debug/` | - | Python integration test framework |

## Tech Stack

- **Runtime**: Node.js 22+
- **Framework**: Fastify 5
- **ORM**: Drizzle ORM
- **Databases**: PostgreSQL 16 + Redis 7
- **Real-time**: Socket.IO 4
- **Language**: TypeScript (ES2022, strict mode)
- **Testing**: Vitest (unit) + Python requests/socketio (integration)

## Code Structure

```
user/src/                          chat/src/
├── index.ts   — service startup   ├── index.ts   — startup + Socket.IO
├── routes.ts  — REST routes       ├── routes.ts  — REST routes
├── core.ts    — business logic    ├── core.ts    — message/room business logic
├── db.ts      — database connect  ├── api.ts     — User Service call adapter
├── schema.ts  — table definitions ├── socket.ts  — WebSocket event handling
├── types.ts   — type definitions  ├── redis.ts   — Redis connection
└── debug-config.ts                ├── schema.ts  — table definitions
                                   ├── types.ts   — type definitions
                                   └── debug-config.ts
```

**Dependency**: Chat Service only calls User Service via `api.ts`, fully isolated.

## Quick Start

### Prerequisites

- Node.js 22+
- PostgreSQL 16+ (databases: `cold_user`, `cold_chat`)
- Redis 7+

### Local Development

```bash
# Install dependencies
cd user && npm install
cd ../chat && npm install

# Sync database schema
cd user && npx drizzle-kit push
cd ../chat && npx drizzle-kit push

# Start services
cd user && npx tsx src/index.ts   # :9000
cd chat && npx tsx src/index.ts   # :9001
```

### Docker

```bash
cd user && docker compose up -d
cd ../chat && docker compose up -d
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `DATABASE_URL` | `postgres://yingo:yingo123@localhost:5432/cold_user` | PostgreSQL connection string |
| `REDIS_URL` | `redis://localhost:6379` | Redis connection string (Chat only) |
| `USER_SERVICE_URL` | `http://localhost:9000` | User Service address (Chat only) |
| `PEPPER_SECRET` | `dev-pepper-change-in-production` | Password pepper |
| `TOKEN_SECRET` | `dev-token-secret-change-in-production` | Token HMAC key |
| `CORS_ORIGINS` | `http://localhost:3000` | CORS whitelist (comma-separated) |
| `LOG_LEVEL` | `info` | Log level |
| `SSL_CERT` / `SSL_KEY` | - | HTTPS certificate paths |
| `INTERNAL_API_KEY` | `dev-internal-key-change-in-production` | Internal API key |

## Architecture

### Hot/Cold Messages

```
send → Redis (hot zone, TTL=10min)
            → archive every 30s
      PostgreSQL (cold zone, persistent)
```

- Messages within 5 minutes go through Redis for fast read/write
- Auto-archived to PostgreSQL after expiry
- No data loss on process restart

### Token System

```
login → issue:
  short_token (32 hex, valid 1h)
  long_token  (64 hex, valid 30d)
verify → HMAC-SHA256 salted comparison
```

## API Overview

Full endpoint documentation: see [API.md](./API.md)

**User Service (16 endpoints)**

| Endpoint | Permission | Description |
|----------|------------|-------------|
| POST /register | Public | Register (first user auto-admin) |
| POST /login | Public | Login → issue Token |
| GET /verify | Bearer | Token verification |
| GET /users/me | Bearer | Current user |
| GET /tokens/me | Bearer | Token list |
| POST /api-keys | Bearer | Create API Key |
| GET /internal/user/:id | Internal key | User lookup |
| GET/DELETE /admin/users | Admin | User management |
| PUT /admin/users/:id/permission | Admin | Update permission |
| GET/DELETE /admin/tokens | Admin | Token management |
| GET /health, /ready, /metrics | Public | Health checks |

**Chat Service (19 endpoints + 5 WebSocket events)**

| Endpoint | Permission | Description |
|----------|------------|-------------|
| POST /rooms/direct | Bearer | Create direct chat |
| POST /rooms/group | Bearer | Create group chat |
| GET /rooms/:id/messages | Bearer | Message history |
| POST /rooms/:id/messages | Bearer | Send message |
| GET/DELETE /admin/rooms | Admin | Room management |
| POST /admin/rooms/:id/members | Admin | Member management |
| GET /admin/stats | Admin | Statistics |

**WebSocket**: `v1:join`, `v1:leave`, `v1:message`, `v1:online`, `v1:error`

## Performance

| Metric | Value |
|--------|-------|
| HTTP concurrency | 200 all pass |
| Throughput | 88 rps |
| Response latency | p50=16ms, p99=2.1s |
| Supported users | 1700+ (chat scenario) |

## Deployment

See [DEPLOY.md](./DEPLOY.md)

## Frontend

React 19 + TypeScript + Vite SPA, deployed to Netlify (from the `yingo-server/chats-apps` repository).

### Tech Stack

- React 19 + TypeScript + Vite
- Zustand (state management) + persist middleware
- Tailwind CSS 4 + shadcn/ui components
- Socket.IO Client (real-time communication)
- React Router v7 (routing)
- Radix UI primitives (Dialog/Dropdown/Tooltip, etc.)

### Bug Audit

**30 key defects found**, see [DEPLOY.md](./DEPLOY.md#frontend-defect-list).
- **P0 crash-level**: 6 — null crash, SSR crash, data corruption
- **P1 functional defects**: 16 — proxy failure, race conditions, memory leaks
- **P2 security defects**: 4 — XSS, token exposure, redirect loss
- **P3 type defects**: 4 — type unsafe, backend extension crashes

## Security

- Helmet security headers (CSP, HSTS, X-Frame-Options)
- Configurable CORS
- Request body limits (User: 1MB, Chat: 64KB)
- Token HMAC-SHA256 + Salt storage
- API Key 128-bit random
- First user auto-admin + advisory lock against concurrency
- Token collision auto-retry
- Request tracking ID (UUID)
- Graceful Shutdown (SIGINT/SIGTERM)

## Testing

```bash
cd debug
python main.py   # runs 1253 integration tests
```
