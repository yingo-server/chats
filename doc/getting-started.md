# Getting Started

How to run Yingo Server locally for development.

## Prerequisites

- Node.js 22+ (developed on Node 24)
- Docker (for PostgreSQL 16 and Redis 7)
- ffmpeg on the PATH (only needed by the Chat Service for video transcoding;
  videos upload as-is when ffmpeg is missing)

## 1. Start the Databases

```bash
docker compose up -d user-db chat-db chat-cache
```

or run the images individually (see [Deployment](./deployment.md) for the
production `docker run` equivalents).

## 2. Start the User Service (port 9000)

```bash
cd user
npm install
npx tsx src/index.ts
```

## 3. Start the Chat Service (port 9001)

```bash
cd chat
npm install
npx tsx src/index.ts
```

## 4. Start the Frontend (port 5173)

```bash
cd frontend
npm install
cp .env.example .env   # VITE_USER_API / VITE_CHAT_API
npm run dev
```

The dev server proxies `/api` to the User Service and `/chat-api` to the Chat
Service.

## Local Environment Variables

For local runs, the default values already work:

| Service | Variable | Local default |
|---------|----------|---------------|
| both | `DATABASE_URL` | `postgres://yingo:yingo123@localhost:5434/cold_chat` (chat) / `...:5433/cold_user` (user) |
| chat | `REDIS_URL` | `redis://localhost:6380` |
| chat | `USER_SERVICE_URL` | `http://localhost:9000` |
| both | `INTERNAL_API_KEY` | `dev-internal-key-change-in-production` |
| user | `PEPPER_SECRET` | `dev-pepper-change-in-production` |
| both | `TOKEN_SECRET` | `dev-token-secret-change-in-production` |

## First Run Notes

- Services wait for Redis/PostgreSQL at startup (10 retries, 2 s apart).
- Tables are **not** created automatically; initialize them via the SQL in
  [Deployment](./deployment.md#database-initialization).
- The first registered user on an empty database automatically becomes `admin`.
- The integration suite is the fastest way to verify a fresh setup:

```bash
$env:CLOUD_MODE="0"; $env:USER_BASE="http://localhost:9000"; $env:CHAT_BASE="http://localhost:9001"
python debug/main.py
```
