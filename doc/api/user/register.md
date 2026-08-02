# POST /api/v1/register — Register a New User

Creates an account. A new account becomes `admin` when the database has no
admins yet, when it is the very first account, or when the username matches
[`ADMIN_USERNAME`](../../configuration.md). Duplicate usernames are resolved by
suffixing `#2`, `#3`, ... on the global name (`resolveGlobalName`).

## Request

```json
{
  "username": "alice",
  "password": "s3cret-pass",
  "app_id": "chat"
}
```

| Field | Type | Required | Rules |
|-------|------|----------|-------|
| `username` | string | Yes | 2–20 characters |
| `password` | string | Yes | 8–128 characters |
| `app_id` | string | No | Defaults to `"chat"` |

## Success — 201

```json
{
  "ok": true,
  "user": {
    "id": "1785686801756479",
    "globalName": "alice",
    "permission": "user"
  }
}
```

## Errors

| Status | Body error |
|--------|------------|
| 400 | `username must be a string` / `username must be 2-20 characters` |
| 400 | `password must be a string` / `password must be 8-128 characters` |
| 400 | `username already taken` (after retry exhaustion on name conflict) |
| 500 | `registration failed, please try again later` |

## Notes

- Registration is serialized by a PostgreSQL advisory lock (`pg_advisory_xact_lock(424242)`),
  which makes the "first admin" decision race-free.
- ID collisions retry automatically (max 3 attempts).
- Passwords are stored as `salt:HMAC-SHA256(pepper, salt + password)`.
