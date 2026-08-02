# Yingo Server — API Documentation

**Version**: `6.3-stable-raw` · **Document date**: 2026-08-02

> This document is synchronized with the running code (`user/src/routes.ts`, `chat/src/routes.ts`,
> `chat/src/socket.ts`). Every endpoint below has been verified by the integration suite
> (`debug/delib.py`, 412 test cases) against both the local and the production deployment.
>
> **What changed in 6.3** (vs. 6.2):
> - `DELETE /api/v1/rooms/:id` — a user deletes/leaves a room (DM: deletes the room; group: leaves;
>   last member leaving deletes the room)
> - `PUT /api/v1/me/room-notes/:roomId` + `GET /api/v1/me/room-notes` — per-user room notes
>   (visible only to the owner)
> - `GET /api/v1/users/search` on the User Service (fuzzy username search)
> - Removed: `POST /logout`, `DELETE /tokens/me`, `GET|DELETE /api-keys/me|:id`,
>   `GET /admin/debug/config` (endpoints no longer exist in the running code)

---

## 1. Common Conventions

### 1.1 Base URLs

| Environment | User Service | Chat Service |
|-------------|--------------|--------------|
| Production | `https://server.344977.xyz:9000` | `https://server.344977.xyz:9001` |
| Local | `http://localhost:9000` | `http://localhost:9001` |

### 1.2 Authentication

```
Authorization: Bearer <short_token | long_token | api_key>
```

| Token type | Format | Validity |
|------------|--------|----------|
| `short_token` | 32 hex chars | 1 hour |
| `long_token` | 64 hex chars | 30 days |
| `api_key` | `mk-` / `rk-` prefix | 7 / 30 / 60 / 90 / 180 days |

- Internal (service-to-service) calls use the `x-internal-key` header instead.
- Admin endpoints additionally require the token's `permission` to be `admin`.
- **First registered user in an empty database automatically becomes `admin`.**

### 1.3 Response Format

Success: `{ "ok": true, ...fields }` — errors: `{ "ok": false, "error": "<message>" }`

| HTTP | Meaning |
|------|---------|
| 200 / 201 | Success / Created |
| 400 | Invalid parameters |
| 401 | Missing or invalid token / credentials |
| 403 | Forbidden (insufficient permission / not a member) |
| 404 | Resource not found |
| 409 | Conflict (username taken) |
| 429 | Rate limited (login: 30/min per IP) |
| 500 / 502 | Internal error / upstream unreachable |

### 1.4 Rate Limiting

- Login: 30 attempts / 60 s per IP (`LOGIN_RATE_LIMIT` / `LOGIN_RATE_WINDOW` env vars).
- API keys carry their own `rate_limit` (default 100 req/min).

---

## 2. User Service (Port 9000)

### 2.1 Public Endpoints

#### POST `/api/v1/register` — Register

| Field | Type | Required | Rules |
|-------|------|----------|-------|
| `username` | string | Yes | 2–20 chars |
| `password` | string | Yes | 8–128 chars |
| `app_id` | string | No | Defaults to `"chat"` |

**201**

```json
{ "ok": true, "user": { "id": "a1b2c3d4e5f6g7h8", "global_name": "test", "app_names": {"chat": "test"}, "permission": "user", "created_at": 1736000000000 } }
```

**Errors**: `username must be 2-20 characters` / `password must be 8-128 characters` (400),
`username already taken` (409→400 in body), `registration failed, please try again later` (500)

#### POST `/api/v1/login` — Login

Body: `{ "username": string, "password": string }` (username 2–64, password 1–128)

**200**

```json
{ "ok": true, "user": { "id": "...", "global_name": "...", "app_names": {}, "permission": "user" },
  "short_token": "...", "short_expires": 1736003600000, "long_token": "...", "long_expires": 1738595600000 }
```

**Errors**: `invalid username or password` (401), `too many login attempts, please try again later` (429)

#### GET `/api/v1/health` — Liveness

**200**: `{ "ok": true, "service": "user-v1", "uptime": 123.4 }`

#### GET `/api/v1/ready` — Readiness

**200**: `{ "ok": true, "service": "user-v1", "db": "ok" }` (DB down → `ok: false`, `db: "error"`)

### 2.2 Authenticated Endpoints

All require `Authorization: Bearer <token>` (401 on missing/invalid token).

#### GET `/api/v1/verify` — Verify token

**200**: `{ "ok": true, "user_id": "...", "scopes": [], "permission": "user" }`

#### GET `/api/v1/users/me` — Current user

**200**: `{ "ok": true, "user": { "id", "global_name", "app_names", "permission", "created_at", "last_online_at", "online" } }`

#### GET `/api/v1/users/:id` — Public profile by ID

ID must be 1–16 chars (`400 invalid id`). **200**: `{ "ok": true, "user": {...} }` · **404** `user not found`

#### GET `/api/v1/users/search?query=...` — Fuzzy username search

Empty query → `{ "ok": true, "users": [] }`. **200**: `{ "ok": true, "users": [{ "id", "global_name", "app_names" }] }` (max 20)

#### GET `/api/v1/tokens/me` — Own token list

**200**: `{ "ok": true, "tokens": [{ "id", "scopes", "short_expires", "long_expires", "created_at", "revoked_at", "last_used_at" }], "total": n }`

#### POST `/api/v1/api-keys` — Create API key

| Field | Type | Required | Rules |
|-------|------|----------|-------|
| `name` | string | Yes | 1–64 chars |
| `scopes` | string[] | Yes | Array (e.g. `["read","write"]`) |
| `expires_days` | number | Yes | 7, 30, 60, 90, or 180 |

**201**

```json
{ "ok": true, "key": { "id": "...", "name": "...", "scopes": "read,write", "rate_limit": 100, "expires_at": 1738595600000 }, "api_key": "mk-..." }
```

> The full `api_key` value is returned only once at creation.

#### PUT `/api/v1/me/room-notes/:roomId` — Set room note

Body: `{ "note": string }` (1–64 chars; **empty string deletes the note**)

**200**: `{ "ok": true, "roomId": "...", "note": "My note" | null }`

**Errors**: `note must be a string` / `note must be 1-64 characters` / `invalid roomId` (400), `failed to save note` (500)

#### GET `/api/v1/me/room-notes` — Own room notes

**200**: `{ "ok": true, "notes": [{ "roomId": "...", "note": "My note" }] }`

> Notes are strictly per-user; they are not visible to other members.

### 2.3 Admin Endpoints

All require an **admin** token. Non-admin → **403** `admin access required`.

#### GET `/api/v1/admin/users` — User list (max 200)

**200**: `{ "ok": true, "users": [{ "id", "global_name", "app_names", "permission", "online", "created_at", "last_online_at" }], "total": n }`

#### GET `/api/v1/admin/users/:id` — User detail

**200**: single user object · **404** `user not found`

#### PUT `/api/v1/admin/users/:id/permission` — Set permission

Body: `{ "permission": "admin" | "user" }`

**200**: `{ "ok": true, "userId": "...", "permission": "admin" }`

**Errors**: `permission must be 'admin' or 'user'` (400) · `cannot demote yourself` (400) ·
`cannot demote the last admin` (400) · `user not found` (404)

#### DELETE `/api/v1/admin/users/:id` — Delete user

**200**: `{ "ok": true, "deleted": "<id>" }`

**Errors**: `cannot delete yourself` (400) · `cannot delete the last admin` (400) · `user not found` (404)

#### GET `/api/v1/admin/tokens` — All tokens (max 200)

**200**: `{ "ok": true, "tokens": [{ "id", "userId", "scopes", "short_expires", "long_expires", "created_at", "revoked_at", "last_used_at" }], "total": n }`

#### DELETE `/api/v1/admin/tokens/:id` — Revoke a token

**200**: `{ "ok": true, "revoked": "<id>" }` · **404** `token not found`

#### GET `/api/v1/metrics` — Service metrics

**200**: `{ "ok": true, "uptime": 123, "memory": {...}, "pid": 1 }` — non-admin → 403

### 2.4 Internal Endpoint

Requires `x-internal-key: <INTERNAL_API_KEY>` (mismatch → **403** `forbidden`).

#### GET `/api/v1/internal/user/:id` — User lookup (used by Chat Service)

ID 1–16 chars. **200**: `{ "ok": true, "id": "...", "name": "...", "app_names": {...} }` · **404** `{ "ok": false }`

---

## 3. Chat Service (Port 9001)

### 3.1 Room Endpoints

#### POST `/api/v1/rooms/direct` — Create DM

Body: `{ "targetUserId": string }`

**201**: `{ "ok": true, "room": { "id", "type": "direct", "name": null, "created_at" } }`

**Errors**: `targetUserId required` (400) · `cannot chat with self` (400) · 500 on failure

> Creating a DM for the same user pair is **idempotent** — the existing room is returned.

#### POST `/api/v1/rooms/group` — Create group

Body: `{ "name"?: string (1–64), "memberIds"?: string[] (max 100) }`

**201**: room object with `"type": "group"`. **Errors**: `name must be string` / `memberIds must be array` / `memberIds max 100` (400)

#### GET `/api/v1/rooms` — My room list

**200**: `{ "ok": true, "rooms": [{ "id", "type", "name", "created_at", "last_message", "members" }] }`

#### GET `/api/v1/rooms/:id` — Room detail

**200**: `{ "ok": true, "room": {...} }` · **403** `not a room member` · **404** `room not found`

#### GET `/api/v1/rooms/:id/members` — Room members

**200**: `{ "ok": true, "members": [{ "id", "room_id", "user_id", "joined_at" }], "total": n }` · 403 / 404 as above

#### DELETE `/api/v1/rooms/:id` — Delete DM / leave group

| Room type | Behavior |
|-----------|----------|
| `direct` | The room is **deleted entirely** for both members |
| `group` | The user **leaves**; if they were the last member the room is **deleted** |

ID 1–16 chars. **200**: `{ "ok": true, "action": "deleted" | "left" }`

**Errors**: `invalid id` (400) · `room not found` (404) · `not a room member` (403)

### 3.2 Message Endpoints

#### GET `/api/v1/rooms/:id/messages` — Message history

Query: `cursor?` (timestamp ms) · `limit` (1–100, default 30; `400 limit must be 1-100` otherwise)

Reads hot (Redis) + cold (PostgreSQL) messages, merged and paginated.

**200**: `{ "ok": true, "messages": [{ "id", "room_id", "sender_id", "sender_name", "content", "type", "sent_at", "recalled" }], "next_cursor": "...", "has_more": bool }`

**Errors**: `not a room member` (403) · 500

#### POST `/api/v1/rooms/:id/messages` — Send message

Body: `{ "content": string (1–2048), "type"?: "text" | "image" | "file" }` (default `text`)

**201**: `{ "ok": true, "message": {...} }`

**Errors**: `content required` (400) · `not a room member` (403) · content length rule → 400 · 500

### 3.3 Proxy Endpoints

#### POST `/api/v1/login` — Login proxy (forwards to User Service)

Body: `{ "username", "password" }` — response passed through unchanged. **502** `user service unreachable`

#### GET `/api/v1/users/search?query=...` — User search proxy

Requires Bearer token; forwards the token to User Service. **200**: `{ "ok": true, "users": [...] }`

### 3.4 Health & Metrics

- `GET /api/v1/health` → `{ "ok": true, "service": "chat-v1", "uptime": ... }`
- `GET /api/v1/ready` → `{ "ok": true, "service": "chat-v1", "db": "ok", "redis": "ok" }`
- `GET /api/v1/metrics` → uptime / memory / pid (no auth)

### 3.5 Admin Endpoints

All require an **admin** token (403 otherwise).

| Endpoint | Description |
|----------|-------------|
| `GET /api/v1/admin/rooms` | All rooms (max 200): `{ ok, rooms, total }` |
| `GET /api/v1/admin/rooms/:id/members` | All members of a room |
| `GET /api/v1/admin/rooms/:id/messages` | Message history **bypassing membership check** (`cursor`, `limit`) |
| `POST /api/v1/admin/rooms/:id/messages` | Send message on behalf: `{ senderId, content, type? }` → 201 |
| `POST /api/v1/admin/rooms/direct` | Create DM between two arbitrary users: `{ userA, userB }` → 201 |
| `POST /api/v1/admin/rooms/group` | Create group with specified creator: `{ creatorId, name, memberIds? }` → 201 |
| `POST /api/v1/admin/rooms/:id/members` | Add member: `{ userId }` → 201 |
| `DELETE /api/v1/admin/rooms/:roomId/members/:userId` | Remove member |
| `GET /api/v1/admin/stats` | `{ ok, stats: { rooms, members, coldMessages, onlineUsers } }` |
| `DELETE /api/v1/admin/rooms/:id` | Delete a room (cascade) → 200 `{ ok, deleted }` |

---

## 4. WebSocket (Chat Service)

```
wss://server.344977.xyz:9001/socket.io   (long_token in handshake auth)
```

Handshake payload: `{ "token": "<long_token>", "user": { "id", "global_name", "app_names" } }`

### 4.1 Events

| Event | Direction | Payload | Behavior |
|-------|-----------|---------|----------|
| `v1:join` | C → S | `{ roomId }` | Joins the room socket room; emits `v1:online` to the room |
| `v1:leave` | C → S | `{ roomId }` | Leaves; emits `v1:online { online: false }` |
| `v1:message` | C → S | `{ roomId, content, type }` (+ack callback) | Persists + broadcasts; error → `v1:error` |
| `v1:message` | S → C | safe message object | Broadcast to all room members |
| `v1:online` | S → C | `{ userId, online }` | Online/offline presence per room |
| `v1:error` | S → C | `{ message }` | `invalid roomId` / `not a room member` / `join failed` / send errors |
| `disconnect` | C → S | — | Marks user offline, notifies rooms |

### 4.2 Message shape

```json
{ "roomId": "r1", "message": { "id": "msg1", "room_id": "r1", "sender_id": "uid1", "sender_name": "alice", "content": "hello", "type": "text", "sent_at": 1736000000000 } }
```

---

## 5. Data Model (PostgreSQL)

| Table | Service DB | Key columns |
|-------|------------|-------------|
| `users` | cold_user | id, global_name (unique), app_names (jsonb), password_hash, permission, online |
| `tokens` | cold_user | id, user_id, token_lookup, short_hash, long_hash, scopes, short/long_expires, revoked_at |
| `api_keys` | cold_user | id, user_id, key_hash, prefix, name, scopes, rate_limit, expires_at |
| `oauth_clients` | cold_user | id, client_id, client_secret_hash, name, app_id, status |
| `room_notes` | cold_user | id, user_id, room_id, note (≤64), updated_at — unique (user_id, room_id) |
| `rooms` | cold_chat | id, type (direct/group), name, creator_id, created_at |
| `room_members` | cold_chat | id, room_id, user_id, joined_at — unique (room_id, user_id) |
| `cold_messages` | cold_chat | id, room_id, sender_id, sender_name, content, type, sent_at, recalled, deleted flags |

## 6. Verification Status

- Integration suite: 24 suites / **412 test cases** (debug/delib.py)
- Local (2026-08-02, `CLOUD_MODE=0`): **412/412 passed**
- Production 6.3-stable-raw (2026-08-02): core suites verified; admin suites pass on a clean database
