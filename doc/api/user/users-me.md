# GET /api/v1/users/me — Current User Profile

Returns the profile of the authenticated user.

## Request

```
GET /api/v1/users/me
Authorization: Bearer <token>
```

## Success — 200

```json
{
  "ok": true,
  "user": {
    "id": "1785686801756479",
    "globalName": "alice",
    "appNames": { "chat": "alice" },
    "permission": "user",
    "createdAt": 1785686860785,
    "lastOnlineAt": 1785686861000,
    "online": true
  }
}
```

## Errors

| Status | Body error |
|--------|------------|
| 401 | `missing token` / `invalid token` |
| 404 | `user not found` |
