# POST /api/v1/api-keys — Create an API Key

Creates a long-lived API key. The full key value is returned only once,
at creation time.

## Request

```json
{
  "name": "ci-bot",
  "scopes": ["read", "write"],
  "expires_days": 30
}
```

| Field | Type | Required | Rules |
|-------|------|----------|-------|
| `name` | string | Yes | 1–64 characters |
| `scopes` | string[] | Yes | Array of scope strings |
| `expires_days` | number | Yes | 7, 30, 60, 90 or 180 |

## Success — 201

```json
{
  "ok": true,
  "key": "rk-9a8b7c6d5e4f3a2b1c0d9e8f7a6b5c4d3e2f1a0b9c8d7e6f5a4b3c2d1e0f9a8b7c6d5e4f3a2b1c0d9e8f7a6b5c4d",
  "name": "ci-bot",
  "expiresDays": 30,
  "rateLimit": 100,
  "prefix": "rk-"
}
```

The full key value is returned only once. Store it immediately; the stored
hash cannot be used to recover it.

## Errors

| Status | Body error |
|--------|------------|
| 400 | `name is required` / `scopes must be an array` / `expires_days must be a number` / business validation errors |
| 401 | `missing token` / `invalid token` |
| 500 | `failed to create API key, please try again later` |

## Notes

- Keys are 128-bit random, stored as `salt:HMAC` hash with a `mk-` / `rk-` prefix
  for identification; the prefix is not secret.
- `rateLimit` is 100 req/min for regular users, `-1` (unlimited) for admins.
- `prefix` is `rk-` for admin keys, `mk-` otherwise.
