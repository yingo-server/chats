# Deployment

## Production Topology (server.344977.xyz)

```
client ──HTTPS──> chat-service (:9001, HTTPS + WSS)
                     │ x-internal-key
                     ▼
                  user-service (:9000, HTTPS)
                     │
                     ├─ user-db (PostgreSQL 16, cold_user)
                     ├─ chat-db (PostgreSQL 16, cold_chat)
                     └─ chat-cache (Redis 7, AOF)
```

All containers share the `yingo-net` Docker network and reach each other by
container name.

| Service | Image | Port |
|---------|-------|------|
| user-service | `ghcr.io/yingo-server/yingo-user:v6.4-stable-Whitenight` | 9000 |
| chat-service | `ghcr.io/yingo-server/yingo-chat:v6.4-stable-Whitenight` | 9001 |
| user-db | `postgres:16-alpine` | 5433 (host) |
| chat-db | `postgres:16-alpine` | 5434 (host) |
| chat-cache | `redis:7-alpine` | 6380 (host) |

> Every CI build publishes three tags: `latest`, the version tag
> (`v6.4-stable-Whitenight`) and the commit SHA. Production pins the version
> tag.

## Prerequisites

- Docker 20.10+ / Docker Compose v2
- SSL certificate (production)
- GitHub PAT to pull `ghcr.io` images

## Database Initialization

Tables are **not** created at startup. On first deploy or reset, create them
manually and grant privileges to the application users (`colduser` /
`coldchat`; the superuser is `yingo`). The full SQL (users/tokens/api_keys/
oauth_clients/room_notes + rooms/room_members/cold_messages/media with
indexes) is available in the repository:

- `user/` schema: `user/src/schema.ts`, `user/migrations/`
- `chat/` schema: `chat/src/schema.ts`, `chat/migrations/`

After DDL, run:

```bash
docker exec user-db psql -U yingo -d cold_user -c "GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO colduser; GRANT USAGE ON SCHEMA public TO colduser;"
docker exec chat-db psql -U yingo -d cold_chat -c "GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO coldchat; GRANT USAGE ON SCHEMA public TO coldchat;"
docker exec chat-cache redis-cli FLUSHALL
```

Otherwise the services fail with `42501 permission denied`. The first
registered user on an empty database automatically becomes `admin` — no manual
setup needed.

## Start Services

```bash
docker network create yingo-net   # once

docker run -d --name user-db --network yingo-net -p 5433:5432 \
  -e POSTGRES_USER=yingo -e POSTGRES_PASSWORD=yingo123 -e POSTGRES_DB=cold_user \
  -v user_pg_data:/var/lib/postgresql/data --restart unless-stopped postgres:16-alpine

docker run -d --name chat-db --network yingo-net -p 5434:5432 \
  -e POSTGRES_USER=yingo -e POSTGRES_PASSWORD=yingo123 -e POSTGRES_DB=cold_chat \
  -v chat_pg_data:/var/lib/postgresql/data --restart unless-stopped postgres:16-alpine

docker run -d --name chat-cache --network yingo-net -p 6380:6379 \
  -v chat_redis_data:/data --restart unless-stopped \
  redis:7-alpine redis-server --appendonly yes

docker run -d --name user-service --network yingo-net -p 9000:9000 \
  -e CORS_ORIGINS="https://chats.344977.xyz,https://server.344977.xyz" \
  -e SSL_CERT=/etc/ssl/yingo/cert.pem -e SSL_KEY=/etc/ssl/yingo/key.pem \
  -e NODE_TLS_REJECT_UNAUTHORIZED=0 -e NODE_ENV=production \
  -e DATABASE_URL="postgresql://colduser:yingo123@user-db:5432/cold_user" \
  -e PEPPER_SECRET="..." -e TOKEN_SECRET="..." -e INTERNAL_API_KEY="..." \
  -v /etc/ssl/yingo:/etc/ssl/yingo:ro --restart unless-stopped \
  ghcr.io/yingo-server/yingo-user:v6.4-stable-Whitenight

docker run -d --name chat-service --network yingo-net -p 9001:9001 \
  -v /etc/ssl/yingo:/etc/ssl/yingo \
  -e SSL_CERT=/etc/ssl/yingo/cert.pem -e SSL_KEY=/etc/ssl/yingo/key.pem \
  -e NODE_ENV=production -e NODE_TLS_REJECT_UNAUTHORIZED=0 \
  -e CORS_ORIGINS="https://chats.344977.xyz,https://server.344977.xyz" \
  -e DATABASE_URL="postgresql://coldchat:yingo123@chat-db:5432/cold_chat" \
  -e REDIS_URL="redis://chat-cache:6379" \
  -e INTERNAL_API_KEY="..." -e TOKEN_SECRET="..." \
  -e USER_SERVICE_URL="https://user-service:9000" \
  --restart unless-stopped \
  ghcr.io/yingo-server/yingo-chat:v6.4-stable-Whitenight
```

> The chat image bundles ffmpeg (`apk add ffmpeg`) for video transcoding.

## CI/CD

- `.github/workflows/chat-build.yml` + `user-build.yml`: on push to `main`
  touching `chat/**` / `user/**`, build and push images to GHCR.
- Frontend: Netlify watches `main` and auto-deploys `frontend/`
  (`netlify.toml`, publish dir `frontend`), with `VITE_USER_API` /
  `VITE_CHAT_API` from the Netlify environment panel.

## Updating a Deployment

```bash
docker pull ghcr.io/yingo-server/yingo-chat:v6.4-stable-Whitenight
docker stop chat-service && docker rm chat-service
# re-run the chat-service docker run command above
```

Redis hot-zone flush after migrations is recommended:

```bash
docker exec chat-cache redis-cli FLUSHALL
```

## Verification

```bash
curl -k https://server.344977.xyz:9000/api/v1/health
curl -k https://server.344977.xyz:9001/api/v1/health
python debug/main.py   # full integration suite against production
```
