# POST /api/v1/login — Login

Verifies credentials and issues a token pair. Rate limited per IP
(30 attempts / 60 s by default).

## Request

```json
{
  "username": "alice",
  "password": "s3cret-pass"
}
```

| Field | Type | Required | Rules |
|-------|------|----------|-------|
| `username` | string | Yes | 2–64 characters |
| `password` | string | Yes | 1–128 characters |

## Success — 200

```json
{
  "ok": true,
  "user_id": "1785686801756479",
  "short_token": "0123...",
  "long_token": "4567...",
  "expires_in": 3600,
  "permission": "user"
}
```

| Field | Description |
|-------|-------------|
| `short_token` | 32 hex chars, valid 1 h |
| `long_token` | 64 hex chars, valid 30 d |
| `expires_in` | Short token TTL in seconds |
| `permission` | `user` or `admin` |

## Errors

| Status | Body error |
|--------|------------|
| 401 | `invalid username or password` |
| 401 | `username must be a string` / `username must be 2-64 characters` / `password must be a string` / `password must be 1-128 characters` |
| 429 | `too many login attempts, please try again later` |
| 500 | `login failed, please try again later` |

## Notes

- Token hashes are stored as `salt:HMAC-SHA256(TOKEN_SECRET, salt + token)`;
  lookups use SHA-256 of the raw token for indexed retrieval.
- Successful login sets `users.online = true` and updates `last_online_at`.
