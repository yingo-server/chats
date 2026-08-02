# Yingo Server 鈥?Deployment Guide

---

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Prerequisites](#prerequisites)
3. [Server Deployment (server.344977.xyz)](#server-deployment-server344977xyz)
4. [Generic Deployment (Other Devices)](#generic-deployment-other-devices)
5. [CI/CD Automated Builds](#cicd-automated-builds)
6. [Debug Mode](#debug-mode)
7. [Updating Deployments](#updating-deployments)
8. [Troubleshooting](#troubleshooting)

---

## Architecture Overview

```
client 鈹€鈹€HTTPS鈹€鈹€> Nginx/CDN 鈹€鈹€> chat-service(:9001) 鈹€鈹€HTTPS鈹€鈹€> user-service(:9000)
                          鈹?                         鈹?                          鈹?                    PostgreSQL(:5432)     PostgreSQL(:5432)
                          鈹?                   Redis(:6379)
```

### Service List

| Service | Image | Port | Dependencies |
|---------|-------|------|--------------|
| user-service | `ghcr.io/yingo-server/yingo-user:v6.4-stable-Whitenight` | 9000 | user-db |
| chat-service | `ghcr.io/yingo-server/yingo-chat:v6.4-stable-Whitenight` | 9001 | chat-db, chat-cache, user-service |
| user-db | `postgres:16-alpine` | 5432 | - |
| chat-db | `postgres:16-alpine` | 5432 | - |
| chat-cache | `redis:7-alpine` | 6379 | - |

> Image tags: every build publishes `latest` + `vX.Y-*` version tag + `commit-sha` (three tags). Production should pin a version tag to avoid accidental `latest` drift.

### Docker Network

All services communicate inside the `yingo-net` network; services reach each other by container name.

---

## Prerequisites

- Docker 20.10+
- Docker Compose v2
- SSL certificate (required in production)
- GitHub PAT (required to pull `ghcr.io` images)

---

## Server Deployment (server.344977.xyz)

> The complete configuration of the current production server; copy and execute directly.

### 1. Log in to ghcr.io

```bash
docker login ghcr.io -u yingo-server -p <GITHUB_PAT>
```

### 2. Create the Docker Network

```bash
docker network create yingo-net
```

### 2.5 Initialize the Database (first deploy / reset)

> **Important**: Table structures are defined in code; services do NOT create tables on startup. On first deploy or reset you MUST create tables manually. The application connects with the `colduser`/`coldchat` users (not `yingo`). **After creating tables you MUST run GRANT**, otherwise the app will fail with `42501 permission denied`.

```bash
# 鈹屸攢鈹€鈹€鈹€鈹€鈹€ 1. Drop all tables in user-db and recreate 鈹€鈹€鈹€鈹€鈹€鈹€鈹?docker exec -i user-db psql -U yingo -d cold_user <<'SQL'
DROP TABLE IF EXISTS oauth_clients, api_keys, tokens, users CASCADE;
CREATE TABLE users (
  id varchar(16) PRIMARY KEY,
  global_name varchar(64) NOT NULL UNIQUE,
  app_names jsonb NOT NULL,
  password_hash text NOT NULL,
  password_salt varchar(32) NOT NULL,
  created_at bigint NOT NULL,
  last_online_at bigint NOT NULL,
  permission varchar(16) NOT NULL DEFAULT 'user',
  online boolean NOT NULL DEFAULT false
);
CREATE TABLE tokens (
  id varchar(16) PRIMARY KEY,
  user_id varchar(16) NOT NULL REFERENCES users(id),
  token_lookup varchar(64) NOT NULL UNIQUE,
  short_lookup varchar(64) NOT NULL UNIQUE,
  short_hash varchar(255) NOT NULL,
  long_hash varchar(255) NOT NULL,
  token_salt varchar(32) NOT NULL,
  short_expires bigint NOT NULL,
  long_expires bigint NOT NULL,
  scopes text NOT NULL DEFAULT '',
  created_at bigint NOT NULL,
  revoked_at bigint,
  last_used_at bigint
);
CREATE INDEX idx_tokens_user_id ON tokens (user_id);
CREATE INDEX idx_tokens_long_expires ON tokens (long_expires);
CREATE INDEX idx_tokens_short_expires ON tokens (short_expires);
CREATE INDEX idx_tokens_revoked_at ON tokens (revoked_at);
CREATE INDEX idx_tokens_lookup ON tokens (token_lookup);
CREATE TABLE api_keys (
  id varchar(16) PRIMARY KEY,
  user_id varchar(16) NOT NULL REFERENCES users(id),
  key_hash varchar(255) NOT NULL,
  key_salt varchar(32) NOT NULL,
  prefix varchar(4) NOT NULL,
  name varchar(64) NOT NULL,
  scopes text NOT NULL DEFAULT '',
  rate_limit integer NOT NULL DEFAULT 100,
  expires_at bigint NOT NULL,
  created_at bigint NOT NULL,
  last_used_at bigint,
  revoked_at bigint
);
CREATE TABLE oauth_clients (
  id varchar(16) PRIMARY KEY,
  client_id varchar(32) NOT NULL UNIQUE,
  client_secret_hash varchar(255) NOT NULL,
  name varchar(64) NOT NULL,
  app_id varchar(32) NOT NULL,
  allowed_scopes text NOT NULL DEFAULT '',
  created_at bigint NOT NULL,
  status integer NOT NULL DEFAULT 1
);
CREATE TABLE room_notes (
  id varchar(16) PRIMARY KEY,
  user_id varchar(16) NOT NULL REFERENCES users(id),
  room_id varchar(16) NOT NULL,
  note varchar(64) NOT NULL,
  updated_at bigint NOT NULL
);
CREATE UNIQUE INDEX idx_room_notes_user_room_unique ON room_notes (user_id, room_id);
CREATE INDEX idx_room_notes_user_id ON room_notes (user_id);
SQL

# 鈹屸攢鈹€鈹€鈹€鈹€鈹€ 2. Drop all tables in chat-db and recreate 鈹€鈹€鈹€鈹€鈹€鈹€鈹?docker exec -i chat-db psql -U yingo -d cold_chat <<'SQL'
DROP TABLE IF EXISTS cold_messages, room_members, rooms CASCADE;
CREATE TABLE rooms (
  id varchar(16) PRIMARY KEY,
  type varchar(8) NOT NULL DEFAULT 'direct',
  name varchar(64),
  creator_id varchar(16) NOT NULL,
  created_at bigint NOT NULL
);
CREATE TABLE room_members (
  id varchar(16) PRIMARY KEY,
  room_id varchar(16) NOT NULL,
  user_id varchar(16) NOT NULL,
  joined_at bigint NOT NULL
);
CREATE UNIQUE INDEX idx_room_members_room_user_unique ON room_members (room_id, user_id);
CREATE TABLE cold_messages (
  id varchar(16) PRIMARY KEY,
  room_id varchar(16) NOT NULL,
  sender_id varchar(16) NOT NULL,
  sender_name varchar(64) NOT NULL,
  sender_app_name varchar(64) NOT NULL,
  content text,
  type varchar(8) NOT NULL DEFAULT 'text',
  sent_at bigint NOT NULL,
  sender_ip varchar(45),
  recalled boolean NOT NULL DEFAULT false,
  manually_deleted boolean NOT NULL DEFAULT false,
  auto_deleted boolean NOT NULL DEFAULT false,
  media_id varchar(16),
  media_type varchar(8)
);
CREATE INDEX idx_msg_media_room_type ON cold_messages (room_id, media_type, id DESC);
CREATE TABLE media (
  id varchar(16) PRIMARY KEY,
  mime_type varchar(64) NOT NULL,
  data bytea NOT NULL,
  size integer NOT NULL,
  sha256 varchar(64) NOT NULL,
  owner_id varchar(16) NOT NULL,
  created_at bigint NOT NULL
);
CREATE UNIQUE INDEX idx_media_sha256_unique ON media (sha256);
SQL

# 鈹屸攢鈹€鈹€鈹€鈹€鈹€ 3. Grant privileges to app users (critical! otherwise 42501 permission denied) 鈹€鈹€鈹€鈹€鈹€鈹€鈹?docker exec user-db psql -U yingo -d cold_user -c "GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO colduser; GRANT USAGE ON SCHEMA public TO colduser;"
docker exec chat-db psql -U yingo -d cold_chat -c "GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO coldchat; GRANT USAGE ON SCHEMA public TO coldchat;"

# 鈹屸攢鈹€鈹€鈹€鈹€鈹€ 4. Flush Redis (hot messages / online state cache) 鈹€鈹€鈹€鈹€鈹€鈹€鈹?docker exec chat-cache redis-cli FLUSHALL

# 鈹屸攢鈹€鈹€鈹€鈹€鈹€ 5. Restart services to invalidate connection pools / in-memory caches 鈹€鈹€鈹€鈹€鈹€鈹€鈹?docker restart user-service chat-service

# 鈹屸攢鈹€鈹€鈹€鈹€鈹€ 6. Verify 鈹€鈹€鈹€鈹€鈹€鈹€鈹?docker exec user-db psql -U yingo -d cold_user -c "\dt"
docker exec chat-db psql -U yingo -d cold_chat -c "\dt"
curl -k https://server.344977.xyz:9000/api/v1/health
curl -k https://server.344977.xyz:9001/api/v1/health
```

> Initial admin: on an empty database, **the first registered user automatically becomes admin** (built-in code logic, no manual setup needed).

### 3. Start the PostgreSQL Databases

```bash
# User Service database
docker run -d --name user-db --network yingo-net \
  -p 5433:5432 \
  -e POSTGRES_USER=yingo \
  -e POSTGRES_PASSWORD=yingo123 \
  -e POSTGRES_DB=cold_user \
  -v user_pg_data:/var/lib/postgresql/data \
  --restart unless-stopped \
  postgres:16-alpine

# Chat Service database
docker run -d --name chat-db --network yingo-net \
  -p 5434:5432 \
  -e POSTGRES_USER=yingo \
  -e POSTGRES_PASSWORD=yingo123 \
  -e POSTGRES_DB=cold_chat \
  -v chat_pg_data:/var/lib/postgresql/data \
  --restart unless-stopped \
  postgres:16-alpine

# Redis
docker run -d --name chat-cache --network yingo-net \
  -p 6380:6379 \
  -v chat_redis_data:/data \
  --restart unless-stopped \
  redis:7-alpine redis-server --appendonly yes
```

### 4. Start the User Service

```bash
docker run -d --name user-service --network yingo-net \
  -p 9000:9000 \
  -e CORS_ORIGINS="https://chats.344977.xyz,https://server.344977.xyz" \
  -e SSL_CERT=/etc/ssl/yingo/cert.pem \
  -e SSL_KEY=/etc/ssl/yingo/key.pem \
  -e NODE_TLS_REJECT_UNAUTHORIZED=0 \
  -e NODE_ENV=production \
  -e DATABASE_URL="postgresql://colduser:yingo123@user-db:5432/cold_user" \
  -e PEPPER_SECRET="dev-pepper-change-in-production" \
  -e TOKEN_SECRET="dev-token-secret-change-in-production" \
  -e INTERNAL_API_KEY="dev-internal-key-change-in-production" \
  -e REDIS_URL="redis://chat-cache:6379" \
  -v /etc/ssl/yingo:/etc/ssl/yingo:ro \
  --restart unless-stopped \
  ghcr.io/yingo-server/yingo-user:v6.4-stable-Whitenight
```

### 5. Start the Chat Service

```bash
docker run -d --name chat-service --network yingo-net \
  -p 9001:9001 \
  -e CORS_ORIGINS="https://chats.344977.xyz,https://server.344977.xyz" \
  -e SSL_CERT=/etc/ssl/yingo/cert.pem \
  -e SSL_KEY=/etc/ssl/yingo/key.pem \
  -e NODE_TLS_REJECT_UNAUTHORIZED=0 \
  -e NODE_ENV=production \
  -e DATABASE_URL="postgresql://coldchat:yingo123@chat-db:5432/cold_chat" \
  -e REDIS_URL="redis://chat-cache:6379" \
  -e USER_SERVICE_URL="https://user-service:9000" \
  -e INTERNAL_API_KEY="dev-internal-key-change-in-production" \
  -e PEPPER_SECRET="dev-pepper-change-in-production" \
  -e TOKEN_SECRET="dev-token-secret-change-in-production" \
  -v /etc/ssl/yingo:/etc/ssl/yingo:ro \
  --restart unless-stopped \
  ghcr.io/yingo-server/yingo-chat:v6.4-stable-Whitenight
```

### 6. Verify

```bash
# Check container status
docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"

# Health checks
curl -k https://server.344977.xyz:9000/api/v1/health
curl -k https://server.344977.xyz:9001/api/v1/health
```

---

## Generic Deployment (Other Devices)

> Works on any Linux server, using your own domain and certificates.

### 1. Environment Variable Template

Replace the following placeholders before deploying:

| Placeholder | Description | Example |
|-------------|-------------|---------|
| `<DOMAIN>` | Your domain | `example.com` |
| `<SSL_CERT_PATH>` | SSL certificate path | `/etc/ssl/certs/cert.pem` |
| `<SSL_KEY_PATH>` | SSL private key path | `/etc/ssl/private/key.pem` |
| `<CORS_ORIGINS>` | Allowed CORS origins | `https://chat.example.com,https://example.com` |
| `<DB_PASSWORD>` | Database password | Generate with `openssl rand -hex 16` |
| `<PEPPER_SECRET>` | Password hash pepper | Generate with `openssl rand -hex 32` |
| `<TOKEN_SECRET>` | Token hash secret | Generate with `openssl rand -hex 32` |
| `<INTERNAL_API_KEY>` | Internal API key | Generate with `openssl rand -hex 32` |

### 2. Generate Strong Keys

```bash
echo "DB_PASSWORD=$(openssl rand -hex 16)"
echo "PEPPER_SECRET=$(openssl rand -hex 32)"
echo "TOKEN_SECRET=$(openssl rand -hex 32)"
echo "INTERNAL_API_KEY=$(openssl rand -hex 32)"
```

### 3. Log in to ghcr.io

```bash
docker login ghcr.io -u <GITHUB_USERNAME> -p <GITHUB_PAT>
```

### 4. Create Network and Volumes

```bash
docker network create yingo-net
```

### 5. Start the Databases

```bash
# User Service database
docker run -d --name user-db --network yingo-net \
  -e POSTGRES_USER=yingo \
  -e POSTGRES_PASSWORD=<DB_PASSWORD> \
  -e POSTGRES_DB=cold_user \
  -v user_pg_data:/var/lib/postgresql/data \
  --restart unless-stopped \
  postgres:16-alpine

# Chat Service database
docker run -d --name chat-db --network yingo-net \
  -e POSTGRES_USER=yingo \
  -e POSTGRES_PASSWORD=<DB_PASSWORD> \
  -e POSTGRES_DB=cold_chat \
  -v chat_pg_data:/var/lib/postgresql/data \
  --restart unless-stopped \
  postgres:16-alpine

# Redis
docker run -d --name chat-cache --network yingo-net \
  -v chat_redis_data:/data \
  --restart unless-stopped \
  redis:7-alpine redis-server --appendonly yes
```

### 6. Start the User Service

```bash
docker run -d --name user-service --network yingo-net \
  -p 9000:9000 \
  -e CORS_ORIGINS="<CORS_ORIGINS>" \
  -e SSL_CERT=<SSL_CERT_PATH> \
  -e SSL_KEY=<SSL_KEY_PATH> \
  -e NODE_TLS_REJECT_UNAUTHORIZED=0 \
  -e NODE_ENV=production \
  -e DATABASE_URL="postgresql://yingo:<DB_PASSWORD>@user-db:5432/cold_user" \
  -e PEPPER_SECRET="<PEPPER_SECRET>" \
  -e TOKEN_SECRET="<TOKEN_SECRET>" \
  -e INTERNAL_API_KEY="<INTERNAL_API_KEY>" \
  -v <SSL_CERT_DIR>:/etc/ssl/yingo:ro \
  --restart unless-stopped \
  ghcr.io/yingo-server/yingo-user:v6.4-stable-Whitenight
```

### 7. Start the Chat Service

```bash
docker run -d --name chat-service --network yingo-net \
  -p 9001:9001 \
  -e CORS_ORIGINS="<CORS_ORIGINS>" \
  -e SSL_CERT=<SSL_CERT_PATH> \
  -e SSL_KEY=<SSL_KEY_PATH> \
  -e NODE_TLS_REJECT_UNAUTHORIZED=0 \
  -e NODE_ENV=production \
  -e DATABASE_URL="postgresql://yingo:<DB_PASSWORD>@chat-db:5432/cold_chat" \
  -e REDIS_URL="redis://chat-cache:6379" \
  -e USER_SERVICE_URL="https://user-service:9000" \
  -e INTERNAL_API_KEY="<INTERNAL_API_KEY>" \
  -e PEPPER_SECRET="<PEPPER_SECRET>" \
  -e TOKEN_SECRET="<TOKEN_SECRET>" \
  -v <SSL_CERT_DIR>:/etc/ssl/yingo:ro \
  --restart unless-stopped \
  ghcr.io/yingo-server/yingo-chat:v6.4-stable-Whitenight
```

### 8. Frontend Deployment

> Frontend lives in **this repository** at `frontend/` and is auto-deployed by Netlify
> (monitors the `main` branch; `netlify.toml` publishes the `frontend/` directory).
> API base URLs are baked at build time from `.env` (`VITE_USER_API` / `VITE_CHAT_API`).

Manual build (alternative hosts):

```bash
cd frontend
npm install
npm run build
# Output in dist/; host the dist/ folder on Nginx/CDN (SPA fallback to index.html)
```

---

## CI/CD Automated Builds

The `yingo-server/chats` repository is configured with GitHub Actions: pushing to `main` (when `user/**`, `chat/**`, or workflow files change) automatically builds and pushes images to ghcr.io. Each build tags three labels: `latest` + `vX.Y-*` version + commit-sha.

### Repository-Image Mapping

| Repository | Image |
|------------|-------|
| `yingo-server/chats` (`user/` directory) | `ghcr.io/yingo-server/yingo-user` |
| `yingo-server/chats` (`chat/` directory) | `ghcr.io/yingo-server/yingo-chat` |

### Publishing a New Version

```bash
# 1. Tag the version (triggers both workflows to rebuild + push the corresponding version-tag image)
git tag vX.Y-stable-xxx
git push origin vX.Y-stable-xxx

# 2. Update type=raw,value=<VERSION> in both workflows, then push to main
git add .github/workflows/user-build.yml .github/workflows/chat-build.yml
git commit -m "ci: tag vX.Y-stable-xxx on user and chat images"
git push origin main
```

### Manual Build Trigger

```bash
# Trigger via the GitHub API
curl -X POST \
  -H "Authorization: token <GITHUB_PAT>" \
  -H "Accept: application/vnd.github.v3+json" \
  https://api.github.com/repos/yingo-server/chats/actions/workflows/user-build.yml/dispatches \
  -d '{"ref":"main"}'
```

---

## Debug Mode

Debug mode temporarily elevates request permission to `admin` via an HTTP header, for testing purposes.

### Usage

Add this header to any HTTP request:

```
x-debug-admin: bf3f1655d8144e2f850dd78f2b27da46
```

### Enable Conditions

- Set the `DEBUG_SECRET` environment variable (value must match the key in the header)
- Or `NODE_ENV !== "production"` (enabled by default in dev environments)

### Example

```bash
# Access an admin endpoint with the debug header
curl -k -H "Authorization: Bearer <TOKEN>" \
     -H "x-debug-admin: bf3f1655d8144e2f850dd78f2b27da46" \
     https://server.344977.xyz:9000/api/v1/admin/users
```

### Security Notes

- The debug header only applies to the current request; without it, permission falls back to normal
- The key is a 128-bit random value, not guessable
- In production you must explicitly set `DEBUG_SECRET` to enable it
- Recommended: remove the `DEBUG_SECRET` environment variable after testing

---

## Updating Deployments

### Pull the Latest Image and Restart

```bash
# Log in to ghcr.io
docker login ghcr.io -u yingo-server -p <GITHUB_PAT>

# Pull the desired version (replace <TAG> with vX.Y-* or commit-sha)
docker pull ghcr.io/yingo-server/yingo-user:<TAG>
docker pull ghcr.io/yingo-server/yingo-chat:<TAG>

# Stop old containers
docker stop user-service chat-service
docker rm user-service chat-service

# Restart (use the full docker run commands above, image tag replaced with <TAG>)
```

### One-Click Update Script

```bash
#!/bin/bash
set -e

TAG=${1:-v6.4-stable-Whitenight}

docker login ghcr.io -u yingo-server -p <GITHUB_PAT>
docker pull ghcr.io/yingo-server/yingo-user:$TAG
docker pull ghcr.io/yingo-server/yingo-chat:$TAG

for svc in user-service chat-service; do
  docker stop $svc 2>/dev/null || true
  docker rm $svc 2>/dev/null || true
done

# Restart (copy the corresponding docker run commands, image tag replaced with $TAG)
```

---

## Troubleshooting

### Containers Won't Start

```bash
# View logs
docker logs user-service --tail 50
docker logs chat-service --tail 50

# Check database connectivity
docker exec user-db pg_isready -U yingo -d cold_user
docker exec chat-db pg_isready -U yingo -d cold_chat

# Check Redis
docker exec chat-cache redis-cli ping
```

### Common Errors

| Error | Cause | Solution |
|-------|-------|----------|
| `ECONNREFUSED` | Database / Redis not started | Check container status |
| `admin access required` | Missing debug header or no admin permission | Add `x-debug-admin` header |
| `unauthorized` | Token invalid or expired | Re-login to get a new token |
| `SSL handshake error` | Wrong cert path or not mounted | Check the `-v` mount and `SSL_CERT`/`SSL_KEY` |
| `42501 permission denied for table ...` | No GRANT to app user after DROP+CREATE | Run the GRANT commands from step 3 of initialization |

### Inspect Container Configuration

```bash
# View environment variables
docker inspect user-service --format '{{range .Config.Env}}{{println .}}{{end}}'
docker inspect chat-service --format '{{range .Config.Env}}{{println .}}{{end}}'

# View network mode
docker inspect user-service --format '{{.HostConfig.NetworkMode}}'
docker inspect chat-service --format '{{.HostConfig.NetworkMode}}'
```

---

## Frontend Deployment

Frontend lives in **this repository** at `frontend/` and is auto-deployed by Netlify
(monitors the `main` branch; `netlify.toml` publishes the `frontend/` directory).

### Build

```bash
cd frontend
npm install
npm run build
# Output in dist/; host the dist/ folder on Nginx/CDN (SPA fallback to index.html)
```

### Frontend Tech Stack

- React 19 + TypeScript + Vite
- Zustand (state management) + persist middleware
- Tailwind CSS 4 + shadcn/ui components
- Socket.IO Client (real-time communication)
- React Router v7 (routing)
- Radix UI primitives (Dialog/Dropdown/Tooltip, etc.)

### Frontend Defect List

The following are **defects that must be fixed**, sorted by severity.

#### P0 鈥?Will cause crashes / data loss

| # | File:Line | Defect | Impact |
|---|-----------|--------|--------|
| 1 | `MessageItem.tsx` | `senderName.slice(0,2).toUpperCase()` 鈥?when `senderName` is empty string, `""` becomes `"undefined"` displayed | Abnormal avatar display |
| 2 | `MessageItem.tsx` | `message.senderId === user?.id` crashes when `user` is null | White screen |
| 3 | `ChatPage.tsx` | `rooms.find(r => r.id === currentRoomId)` 鈥?when room not found, all subsequent destructuring crashes | White screen |
| 4 | `useUIStore.ts` | `window.innerWidth >= 768` crashes in SSR / no-window environments | White screen on first paint |
| 5 | `useMessageStore.ts` | Concurrent fetchMessages interleave; new request's prepend gets overwritten by stale request | Message list scrambled |
| 6 | `useRoomStore.ts` | createDirect/createGroup failure has no rollback; UI updated but data not created | Dirty room list |

#### P1 鈥?Functional defects (user-visible wrong behavior)

| # | File | Defect | Impact |
|---|------|--------|--------|
| 7 | `api/client.ts` | chat API baseUrl defaults to `""`; `/chat-api` proxy never triggered | Dev environment cannot talk to chat |
| 8 | `useSocket.ts` | `chatApiUrl` defaults to `${origin}/chat-api`; production Nginx has no such route | Production socket connection fails |
| 9 | `useAuthStore.ts` | login() then immediately fetchMe(); token may not be effective yet | Occasional 401 redirect to login after login |
| 10 | `ChatPage.tsx` | reconnecting state: `setReconnecting(false)` after 5s while actually still reconnecting | Misleading reconnect indicator |
| 11 | `MessageInput.tsx` | After send failure, setText(content) but cursor position lost | User must re-click the input |
| 12 | `useSocket.ts` | sendMessage timeout 10s; guaranteed timeout on weak networks | Message send fails on weak networks |
| 13 | `CreateRoom.tsx` | `memberIds.length > 0 ? memberIds : undefined` 鈥?empty array passes undefined | Group creation parameter anomaly |
| 14 | `Header.tsx` | When permission is null, admin badge not shown even if user is admin | Admin features invisible |
| 15 | `ProfilePage.tsx` | adminGetUser failure swallowed by catch; user sees blank page | No feedback when viewing others fails |
| 16 | `useRoomStore.ts` | fetchRooms() failure has no error state; UI silent | Room list load failure is silent |
| 17 | `MessageList.tsx` | prevMsgCountRef during reverse rendering makes scrollIntoView positioning inaccurate | New message scroll-to-bottom offset |
| 18 | `App.tsx` | ToastListener addEventListener/removeEventListener on every render | Memory leak |
| 19 | `api/client.ts` | AbortController not aborted on component unmount | Memory leak + setState after unmount |
| 20 | `useOnlineStatus.ts` | Deletion logic deletes keys that are not the oldest N; 500-key limit bypassed | Redis keys grow unbounded |
| 21 | `api/client.ts` | 10s timeout too short; large messages on weak networks always fail | Large file upload timeout |
| 22 | `vite.config.ts` | /chat-api proxy points at localhost:9001 but client.ts baseUrl="" never triggers it | Dev proxy exists in name only |

#### P2 鈥?Security defects

| # | File | Defect | Impact |
|---|------|--------|--------|
| 23 | `api/client.ts` | After 401 clears localStorage, redirect to /login doesn't preserve returnTo | Returns to home instead of original page after login |
| 24 | `MessageItem.tsx` | message.content rendered directly without sanitization, XSS risk | Stored XSS |
| 25 | `useSocket.ts` | longToken read from localStorage with no encryption | Plaintext token exposure |
| 26 | `useAuthStore.ts` | fetchMe() failure clears all auth state, duplicated with client.ts 401 handling | Double-clear causes flicker redirect |

#### P3 鈥?Type / compile defects

| # | File | Defect | Impact |
|---|------|--------|--------|
| 27 | `api/client.ts` | Non-JSON response returns `{} as T`, type unsafe | Runtime undefined access |
| 28 | `types/models.ts` | Room memberIds field type defined but API may not return it | Runtime undefined |
| 29 | `types/models.ts` | Message.type hardcoded to 4 values; frontend crashes when backend extends | White screen when backend adds message types |
| 30 | `api/client.ts` | Error handling throws Error for both network and HTTP errors, indistinguishable | Cannot correctly handle different error types |
