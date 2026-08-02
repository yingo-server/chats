# Database

Two PostgreSQL 16 databases plus one Redis instance. Tables are defined with
Drizzle ORM in `user/src/schema.ts` and `chat/src/schema.ts`; they are **not**
auto-created at startup — initialize them manually (see
[Deployment](./deployment.md#database-initialization)).

## `cold_user` (User Service)

### `users`

| Column | Type | Notes |
|--------|------|-------|
| `id` | varchar(16) PK | 16-digit numeric string |
| `global_name` | varchar(64) UNIQUE | Public unique name (`alice`, `alice#2`, ...) |
| `app_names` | jsonb | Per-app display names, e.g. `{ "chat": "alice" }` |
| `password_hash` | text | `salt:HMAC-SHA256(pepper, salt + password)` |
| `password_salt` | varchar(32) | Per-user salt |
| `created_at` | bigint | Unix ms |
| `last_online_at` | bigint | Unix ms |
| `permission` | varchar(16) | `user` or `admin` |
| `online` | boolean | Cached presence flag |

### `tokens`

| Column | Type | Notes |
|--------|------|-------|
| `id` | varchar(16) PK | |
| `user_id` | varchar(16) FK → users | |
| `token_lookup` | varchar(64) UNIQUE | SHA-256 of the long token |
| `short_lookup` | varchar(64) UNIQUE | SHA-256 of the short token |
| `short_hash` / `long_hash` | varchar(255) | `salt:HMAC(...)` of each token |
| `token_salt` | varchar(32) | Per-token salt |
| `short_expires` / `long_expires` | bigint | Unix ms |
| `scopes` | text | Space-separated scopes, e.g. `user:read chat:read chat:send` |
| `created_at` / `revoked_at` / `last_used_at` | bigint | |

Indexes: `user_id`, `long_expires`, `short_expires`, `revoked_at`, `token_lookup`.

### `api_keys`

| Column | Type | Notes |
|--------|------|-------|
| `id` | varchar(16) PK | |
| `user_id` | varchar(16) FK → users | |
| `key_hash` / `key_salt` | varchar(255) / varchar(32) | Salted HMAC of the key |
| `prefix` | varchar(4) | `mk-` or `rk-` |
| `name` | varchar(64) | |
| `scopes` | text | |
| `rate_limit` | integer | Default 100 req/min, `-1` unlimited |
| `expires_at` / `created_at` / `last_used_at` / `revoked_at` | bigint | |

### `oauth_clients`

Reserved for OAuth2 clients: `client_id` (unique), `client_secret_hash`,
`name`, `app_id`, `allowed_scopes`, `status`.

### `room_notes`

| Column | Type | Notes |
|--------|------|-------|
| `id` | varchar(16) PK | |
| `user_id` | varchar(16) FK → users | |
| `room_id` | varchar(16) | Not a DB foreign key (rooms live in `cold_chat`) |
| `note` | varchar(64) | |
| `updated_at` | bigint | |

Unique index `(user_id, room_id)` — one note per user per room.

## `cold_chat` (Chat Service)

### `rooms`

| Column | Type | Notes |
|--------|------|-------|
| `id` | varchar(16) PK | |
| `type` | varchar(8) | `direct` or `group` |
| `name` | varchar(64) | Group name; permanent (read-only in the UI) |
| `creator_id` | varchar(16) | |
| `created_at` | bigint | |

### `room_members`

| Column | Type | Notes |
|--------|------|-------|
| `id` | varchar(16) PK | |
| `room_id` | varchar(16) | |
| `user_id` | varchar(16) | |
| `joined_at` | bigint | |

Unique index `(room_id, user_id)` — at most one membership per pair.

### `cold_messages`

| Column | Type | Notes |
|--------|------|-------|
| `id` | varchar(16) PK | |
| `room_id` | varchar(16) | |
| `sender_id` / `sender_name` / `sender_app_name` | varchar | Denormalized for history reads |
| `content` | text | |
| `type` | varchar(8) | `text` |
| `sent_at` | bigint | |
| `sender_ip` | varchar(45) | Stripped from API responses |
| `recalled` / `manually_deleted` / `auto_deleted` | boolean | |
| `media_id` / `media_type` | varchar(16) / varchar(8) | Nullable; `media_type` ∈ image/audio/video/file |

Index `(room_id, media_type, id)` for media-filtered pagination.

### `media`

| Column | Type | Notes |
|--------|------|-------|
| `id` | varchar(16) PK | |
| `mime_type` | varchar(64) | e.g. `image/png`, `video/mp4` |
| `data` | bytea | Binary blob |
| `size` | integer | Bytes |
| `sha256` | varchar(64) UNIQUE | Content hash for deduplication |
| `owner_id` | varchar(16) | Original uploader |
| `created_at` | bigint | |

Unique index on `sha256` guarantees idempotent uploads even under races.

## Redis Keys (Chat Service)

| Key | Type | TTL | Purpose |
|-----|------|-----|---------|
| `hot:msg:<id>` | string | 600 s | Hot-zone message |
| `hot:room:<roomId>` | list | 600 s | Hot-zone room index |
| `hot:last:<roomId>:<senderId>` | string | 600 s | Last-message time (inter-message interval) |
| `online:<userId>` | string | 120 s | Presence marker |
| `lock:direct:<a>:<b>` | string | 8 s | DM creation lock |
| `ratelimit:msg:<uid>` | key | 10 s | Socket message rate limit |

AOF is enabled in production (`--appendonly yes`) so hot messages survive a
Redis restart; cold storage remains the source of truth.
