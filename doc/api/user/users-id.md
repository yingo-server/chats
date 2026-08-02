# GET /api/v1/users/:id — Public User Profile by ID

Returns the profile of any user by their ID. Requires authentication;
exposes the same public fields as `/api/v1/users/me`.

## Request

```
GET /api/v1/users/1785686801756479
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
| 400 | `invalid id` (not a string or longer than 16 chars) |
| 401 | `missing token` / `invalid token` |
| 404 | `user not found` |
