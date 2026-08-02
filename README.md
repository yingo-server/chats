# Yingo Server

**Version**: `v6.4-stable-Whitenight` — **License**: AGPL-3.0

A self-hosted real-time chat platform. Microservice backend
(Fastify + Socket.IO + PostgreSQL + Redis), React 19 SPA frontend
(Netlify), and a 485-case integration test framework.

## Features

- **Real-time chat**: rooms (direct + group), hot/cold message storage
  (Redis hot zone → PostgreSQL), WebSocket presence with multi-device support
- **Media attachments**: images, audio, video and files — 30 MB per file,
  content-addressable deduplication, videos transcoded to 480p (ffmpeg)
- **Accounts**: registration, login, short/long token pair, API keys,
  per-room notes, admin role (first user auto-promoted)
- **Admin tooling**: user/token/room/media management, stats, metrics,
  HTML dashboard at `/admin`
- **Hardening**: peppered password hashing, salted HMAC tokens, rate
  limiting, last-admin protection, graceful shutdown

## Quick Start

```bash
docker compose up -d user-db chat-db chat-cache
cd user && npm install && npx tsx src/index.ts   # :9000
cd chat && npm install && npx tsx src/index.ts   # :9001
cd frontend && npm install && npm run dev        # :5173
```

> The first registered user on an empty database automatically becomes
> `admin`. Tables are not auto-created — see the deployment guide.

## Documentation

The full documentation lives in [`doc/`](./doc/):

| Topic | Link |
|-------|------|
| Documentation index | [doc/README.md](./doc/README.md) |
| API reference (every endpoint, one page each) | [doc/api/](./doc/api/README.md) |
| WebSocket protocol | [doc/api/socket/](./doc/api/socket/README.md) |
| Getting started | [doc/getting-started.md](./doc/getting-started.md) |
| Architecture | [doc/architecture.md](./doc/architecture.md) |
| Configuration | [doc/configuration.md](./doc/configuration.md) |
| Database | [doc/database.md](./doc/database.md) |
| Media system | [doc/media.md](./doc/media.md) |
| Security | [doc/security.md](./doc/security.md) |
| Testing | [doc/testing.md](./doc/testing.md) |
| Deployment | [doc/deployment.md](./doc/deployment.md) |
| Changelog | [doc/changelog.md](./doc/changelog.md) |
| Acknowledgements & licenses | [doc/acknowledgements.md](./doc/acknowledgements.md) |

## Repository Layout

| Path | Content |
|------|---------|
| `user/` | User Service (port 9000): accounts, tokens, API keys, notes, admin |
| `chat/` | Chat Service (port 9001): rooms, messages, media, WebSocket |
| `frontend/` | React 19 + Vite + Tailwind SPA |
| `debug/` | Python integration suite (25 suites / 485 tests) |
| `doc/` | Documentation (this site) |
| `.github/workflows/` | CI: build + push `ghcr.io/yingo-server/yingo-user` / `yingo-chat` |

## Tech Stack

Node.js 22+ · TypeScript strict · Fastify 4 · Socket.IO 4 · Drizzle ORM ·
PostgreSQL 16 · Redis 7 · React 19 · Vite 8 · Tailwind 4 · Zustand ·
Radix UI · Vitest · Python (requests + python-socketio)

## Project Status

- Integration suite: **485/485** passing locally (2026-08-03)
- Production: deployed at `chats.344977.xyz` / `server.344977.xyz`

## License

GNU Affero General Public License v3.0 — see [LICENSE](./LICENSE).
Dependency licenses are listed in [doc/acknowledgements.md](./doc/acknowledgements.md).
