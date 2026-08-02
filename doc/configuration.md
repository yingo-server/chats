# Configuration

Environment variables consumed by the two services. All values are read at
startup.

## Common (User + Chat Service)

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `9000` / `9001` (hard-coded listen port per service) | HTTP/HTTPS listen port |
| `NODE_ENV` | — | `production` disables debug conveniences |
| `CORS_ORIGINS` | `http://localhost:3000,http://localhost:9001` | Comma-separated allowed origins |
| `SSL_CERT` / `SSL_KEY` | — | HTTPS certificate / key paths; when both are set the service serves HTTPS |
| `NODE_TLS_REJECT_UNAUTHORIZED` | — | Set to `0` when the internal HTTPS connection uses a self-signed certificate |
| `INTERNAL_API_KEY` | `dev-internal-key-change-in-production` | Secret for the `x-internal-key` header (service-to-service) |
| `TOKEN_SECRET` | `dev-token-secret-change-in-production` | HMAC key for tokens |
| `LOG_LEVEL` | `info` | pino log level |

## User Service Only

| Variable | Default | Description |
|----------|---------|-------------|
| `DATABASE_URL` | — | PostgreSQL DSN for `cold_user` |
| `PEPPER_SECRET` | `dev-pepper-change-in-production` | Pepper for password hashing |
| `LOGIN_RATE_LIMIT` | `30` | Max login attempts per window per IP |
| `LOGIN_RATE_WINDOW` | `60000` | Login rate-limit window in ms |
| `ADMIN_USERNAME` | — | Registering this username grants `admin` permission |

## Chat Service Only

| Variable | Default | Description |
|----------|---------|-------------|
| `DATABASE_URL` | — | PostgreSQL DSN for `cold_chat` |
| `REDIS_URL` | `redis://localhost:6379` | Redis DSN (hot zone, presence, locks, rate limits) |
| `USER_SERVICE_URL` | `http://localhost:9000` | User Service base URL |
| `CORS_ORIGINS` | — | Also used for the Socket.IO CORS allow-list (plus `https://chats.344977.xyz`) |

## Frontend (build-time)

| Variable | Description |
|----------|-------------|
| `VITE_USER_API` | User Service base URL baked into the bundle |
| `VITE_CHAT_API` | Chat Service base URL baked into the bundle |

Set these in `frontend/.env` (tracked) or, on Netlify, as environment variables
in the site settings (panel variables override the file during builds).

## Body & Request Limits (Chat Service)

Hard-coded in `chat/src/index.ts` and `chat/src/utils.ts`:

| Limit | Value | Purpose |
|-------|-------|---------|
| `bodyLimit` | 40 MB | Base64 payloads of a 30 MB file (`×4/3`) |
| `requestTimeout` | 60 s | Long media uploads / transcodes |
| `MAX_MEDIA_BYTES` | 30 MB | Max decoded media size |
| message content | 10 000 chars | Per message |
