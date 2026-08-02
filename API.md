# Yingo Server — API Documentation

Covers the REST endpoints of the User Service and Chat Service.

- **Base URL (production)**: `https://server.344977.xyz:9000` (user) / `:9001` (chat)
- **Local**: `http://localhost:9000` / `http://localhost:9001`
- Unless noted, all responses are JSON: `{ "ok": true, "data": ... }` or `{ "ok": false, "error": "..." }`

---

## 1. User Service (Port 9000)

### 1.1 Authentication Header

```
Authorization: Bearer <short_token | long_token | api_key>
```

| Token Type | Format | Validity |
|------------|--------|----------|
| short_token | 32 hex chars | 1 hour |
| long_token | 64 hex chars | 30 days |
| api_key | `mk-` or `rk-` prefix | Configurable (7/30/60/90/180 days) |

### 1.2 Admin Permission

| Permission | Capabilities |
|------------|-------------|
| `admin` | User management, token management, metrics, debug |
| `user` | Normal user features only |

First registered user in an empty database automatically becomes `admin`.

---

### 1.3 Public Endpoints

#### POST `/api/v1/register`

Register a new user.

**Request Body**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `global_name` | string | Yes | 1-64 chars, `[a-zA-Z0-9_\-]` only |
| `app_name` | string | Yes | App name, 1-64 chars |
| `password` | string | Yes | 6-64 chars |
| `invite_code` | string | No | Invite code |

**Success 201**

```json
{ "ok": true, "data": { "user": { "id": "a1b2c3d4e5f6g7h8", "global_name": "test", "app_names": {"test": "test"}, "created_at": 1736000000000 } } }
```

**Errors**: `username taken` (409), `invalid username` / `invalid app name` / `weak password` (400), `invalid invite code` (400)

#### POST `/api/v1/login`

Login with username + password.

**Request Body**: `{ "global_name": string, "app_name": string, "password": string }`

**Success 200**

```json
{ "ok": true, "data": { "user": { "id": "...", "global_name": "...", "app_names": {}, "permission": "user" }, "short_token": "...", "short_expires": 1736003600000, "long_token": "...", "long_expires": 1738595600000 } }
```

**Errors**: `user not found` / `wrong password` (401)

#### GET `/api/v1/health`

Service health check. **Success 200**

```json
{ "status": "ok", "version": "1.0.0" }
```

---

### 1.4 Token Management

#### GET `/api/v1/verify`

Verify token and return user info.

**Request**: Bearer token

**Success 200**

```json
{ "ok": true, "data": { "user": { "id": "...", "global_name": "...", "app_names": {}, "permission": "user" } } }
```

#### GET `/api/v1/tokens/me`

List tokens of current user.

**Success 200**: Token list with scopes, expiration, creation time.

#### DELETE `/api/v1/tokens/me`

Revoke all tokens of current user.

**Success 200**

```json
{ "ok": true, "data": { "revoked": true } }
```

---

### 1.5 User Endpoints

#### GET `/api/v1/users/me`

Get current user info.

**Success 200**

```json
{ "ok": true, "data": { "user": { "id": "...", "global_name": "...", "app_names": {}, "permission": "user" } } }
```

#### GET `/api/v1/users/:id`

Get user info by ID.

**Success 200**

```json
{ "ok": true, "data": { "user": { "id": "...", "global_name": "...", "app_names": {} } } }
```

**Errors**: `user not found` (404)

#### POST `/api/v1/logout`

Log out current user.

**Success 200**

```json
{ "ok": true, "data": { "logged_out": true } }
```

---

### 1.6 API Keys

#### POST `/api/v1/api-keys`

Create an API key.

**Request Body**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | Yes | 1-64 chars |
| `scopes` | string[] | No | Comma-separated list, e.g. `read,write` |
| `valid_days` | number | No | 7, 30, 60, 90, or 180 (default 30) |
| `rate_limit` | number | No | Requests/minute (default 100) |

**Success 201**

```json
{ "ok": true, "data": { "key": { "id": "...", "name": "...", "scopes": "...", "rate_limit": 100, "expires_at": 1738595600000 }, "api_key": "mk-..." } }
```

> The `api_key` full value is only returned once.

#### GET `/api/v1/api-keys/me`

List API keys of current user.

#### DELETE `/api/v1/api-keys/:id`

Revoke an API key.

---

### 1.7 Admin Endpoints

All require `admin` permission. Support:

- `?limit` — max rows (default 20)
- `?offset` — pagination offset
- `?search` — keyword search
- Sorting: `created_at DESC`

#### GET `/api/v1/admin/users`

List users.

**Success 200**

```json
{ "ok": true, "data": { "users": [ { "id": "...", "global_name": "...", "app_names": {}, "permission": "user", "online": false, "created_at": 1736000000000 } ], "total": 1 } }
```

#### GET `/api/v1/admin/users/:id`

Get user details.

**Success 200**

```json
{ "ok": true, "data": { "user": { "id": "...", "global_name": "...", "app_names": {}, "permission": "user", "online": false, "created_at": 1736000000000 } } }
```

#### PUT `/api/v1/admin/users/:id/permission`

Update user permission.

**Request Body**: `{ "permission": "admin" | "user" }`

**Success 200**

```json
{ "ok": true, "data": { "user": { "id": "...", "permission": "admin" } } }
```

**Errors**: `invalid permission` (400), `cannot demote the last admin` (400), `user not found` (404)

#### GET `/api/v1/admin/tokens`

List all tokens.

**Success 200**: Token list with user info, expiration, revocation status.

#### DELETE `/api/v1/admin/tokens/:id`

Revoke a specific token.

#### GET `/api/v1/metrics`

Service metrics (requireAdmin; no auth → 403).

**Success 200**

```json
{ "ok": true, "data": { "metrics": { "uptime_seconds": 1234, "total_requests": 567, "requests_per_minute": 12, "db_pool": { "total": 10, "idle": 8 }, "memory_usage_mb": 45.2 } } }
```

#### GET `/api/v1/debug/config`

Debug configuration (returns JSON in dev/test).

---

### 1.8 Internal Endpoints

Require `x-internal-key` header matching `INTERNAL_API_KEY`.

#### GET `/api/v1/internal/user/:id`

Internal user lookup (used by Chat Service).

**Success 200**

```json
{ "ok": true, "data": { "user": { "id": "...", "global_name": "...", "app_names": {}, "permission": "user", "online": false } } }
```

**Errors**: `user not found` (404)

---

## 2. Chat Service (Port 9001)

### 2.1 WebSocket

```
wss://server.344977.xyz:9001/socket.io
```

**Connection handshake**

```json
{ "token": "<long_token>", "user": { "id": "xxx", "global_name": "yyy", "app_names": {} } }
```

**Events**

| Event | Direction | Description |
|-------|-----------|-------------|
| `v1:join` | Client → Server | Join room |
| `v1:leave` | Client → Server | Leave room |
| `v1:message` | Client → Server | Send message |
| `v1:online` | Server → Client | Online status update |
| `v1:message` | Server → Client | New message broadcast |
| `v1:error` | Server → Client | Error notification |
| `disconnect` | Client → Server | Disconnect |

**Send message payload**

```json
{ "roomId": "xxx", "type": "text", "content": "hello" }
```

**Server broadcast payload**

```json
{ "roomId": "xxx", "message": { "id": "msg1", "room_id": "xxx", "sender_id": "uid1", "sender_name": "alice", "content": "hello", "type": "text", "sent_at": 1736000000000 }, "user": { "id": "uid1", "global_name": "alice", "app_names": {} } }
```

---

### 2.2 Rooms

#### POST `/api/v1/rooms/direct`

Create a direct chat.

**Request Body**: `{ "target_user_id": string, "app_name"?: string }`

**Success 201**

```json
{ "ok": true, "data": { "room": { "id": "r1", "type": "direct", "name": null, "created_at": 1736000000000 }, "members": [ { "user_id": "uid1" }, { "user_id": "uid2" } ] } }
```

#### POST `/api/v1/rooms/group`

Create a group chat.

**Request Body**: `{ "name": string (1-64), "member_ids": string[] }`

**Success 201**: Same structure as direct room, `type: "group"`.

#### GET `/api/v1/rooms/me`

List rooms of current user.

**Success 200**: Room list with member info and last message.

---

### 2.3 Messages

#### GET `/api/v1/rooms/:id/messages`

Get message history (Redis + PostgreSQL merged, paginated).

**Query Params**

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `limit` | number | 50 | Max 100 |
| `offset` | number | 0 | Pagination offset |
| `before` | number | - | Timestamp (ms), only messages earlier than this |

**Success 200**

```json
{ "ok": true, "data": { "messages": [ { "id": "msg1", "room_id": "r1", "sender_id": "uid1", "sender_name": "alice", "content": "hello", "type": "text", "sent_at": 1736000000000, "recalled": false } ], "total": 1, "has_more": false } }
```

#### POST `/api/v1/rooms/:id/messages`

Send a message.

**Request Body**: `{ "type": "text" | "image" | "file", "content": string (1-2048), "app_name"?: string }`

**Success 201**: Message object as above.

---

### 2.4 Admin Endpoints

All require `admin` permission.

#### GET `/api/v1/admin/rooms`

List all rooms.

**Success 200**: Room list with member count and last message time.

#### DELETE `/api/v1/admin/rooms/:id`

Delete a room (members and messages cascade).

**Success 200**

```json
{ "ok": true, "data": { "deleted": true } }
```

#### POST `/api/v1/admin/rooms/:id/members`

Add members to a room.

**Request Body**: `{ "user_ids": string[] }`

**Success 201**

```json
{ "ok": true, "data": { "members": [ { "id": "m1", "room_id": "r1", "user_id": "uid3", "joined_at": 1736000000000 } ] } }
```

#### DELETE `/api/v1/admin/rooms/:id/members/:userId`

Remove a member from a room.

#### GET `/api/v1/admin/stats`

Service statistics.

**Success 200**

```json
{ "ok": true, "data": { "stats": { "total_rooms": 5, "total_messages": 120, "hot_messages": 34, "cold_messages": 86, "active_users": 3 } } }
```

#### GET `/api/v1/admin/metrics`

Service metrics.

**Success 200**

```json
{ "ok": true, "data": { "metrics": { "uptime_seconds": 1234, "total_requests": 890, "requests_per_minute": 45, "socket_connections": 12, "redis_cache_hits": 89, "redis_cache_misses": 11, "memory_usage_mb": 67.8 } } }
```

---

## 3. Error Format

```json
{ "ok": false, "error": "<error code>" }
```

| HTTP Status | Meaning |
|-------------|---------|
| 200 | Success |
| 201 | Created |
| 400 | Invalid parameters |
| 401 | Unauthorized (missing/invalid token) |
| 403 | Forbidden (insufficient permission) |
| 404 | Resource not found |
| 409 | Conflict (e.g. username taken) |
| 429 | Rate limited |
| 500 | Internal server error |
