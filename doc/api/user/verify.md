# GET /api/v1/verify — Verify a Token

Validates the Bearer token and returns its subject and permissions. Used by
clients to check session validity.

## Request

```
GET /api/v1/verify
Authorization: Bearer <token>
```

## Success — 200

```json
{
  "ok": true,
  "user_id": "1785686801756479",
  "scopes": [],
  "permission": "user"
}
```

## Errors

| Status | Body error |
|--------|------------|
| 401 | `missing token` |
| 401 | `invalid token` |
