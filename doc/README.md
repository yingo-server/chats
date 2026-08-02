# Yingo Server — Documentation

**Version**: `v6.4-stable-Whitenight` — **Document date**: 2026-08-03

Yingo Server is a real-time chat platform built as a microservice backend
(Fastify + Socket.IO + PostgreSQL + Redis), a React 19 single-page application,
and a full integration test framework. This documentation set is authoritative
for the running code; every endpoint is verified by the integration suite.

## Documentation Map

| Document | Purpose |
|----------|---------|
| [Getting Started](./getting-started.md) | Quick start for local development |
| [Architecture](./architecture.md) | Services, hot/cold storage, token & auth model |
| [Configuration](./configuration.md) | Environment variables of both services |
| [Database](./database.md) | Table definitions and indexes |
| [Media](./media.md) | Media upload, deduplication and video transcoding |
| [Security](./security.md) | Security model and hardening measures |
| [Testing](./testing.md) | Integration test framework (25 suites, 485 tests) |
| [Deployment](./deployment.md) | Production deployment guide |
| [Changelog](./changelog.md) | Project release history |
| [Acknowledgements](./acknowledgements.md) | Dependencies, licenses, credits |

## API Reference

Every endpoint has its own page.

- [API Conventions](./api/README.md) — base URLs, authentication, response format, errors, rate limits
- [User Service APIs](./api/user/README.md) — registration, login, tokens, API keys, room notes, admin
- [Chat Service APIs](./api/chat/README.md) — rooms, messages, media, admin
- [WebSocket Protocol](./api/socket/README.md) — real-time events and payloads

## Repository Layout

| Path | Content |
|------|---------|
| `user/` | User Service (port 9000) — Fastify REST API |
| `chat/` | Chat Service (port 9001) — Fastify REST + Socket.IO |
| `frontend/` | React 19 + Vite + Tailwind SPA |
| `debug/` | Python integration test framework (`delib.py`, `main.py`) |
| `doc/` | This documentation set |
| `.github/workflows/` | CI pipelines (build + push Docker images to GHCR) |

## Quick Facts

- **REST endpoints**: User Service 19, Chat Service 29 (plus 3 health/ready/metrics each)
- **WebSocket events**: `v1:join`, `v1:leave`, `v1:message`, `v1:online`, `v1:error`
- **Message flow**: Redis hot zone (10 min TTL) → PostgreSQL cold zone (archiver)
- **Media**: single `media` table, sha256 content deduplication, 30 MB per file,
  videos transcoded to 480p (H.264/AAC) via ffmpeg
- **Tokens**: `short_token` (32 hex, 1 h) + `long_token` (64 hex, 30 d)
- **Auth**: peppered + salted HMAC-SHA256 password hashing; admin permission model;
  first registered user on an empty database becomes `admin`
- **Test coverage**: 25 integration suites / 485 test cases, all green locally
