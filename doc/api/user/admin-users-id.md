# GET /api/v1/admin/users/:id — User Detail (Admin)

Returns one user by ID. Requires an admin token.

## Request

```
GET /api/v1/admin/users/1785686801756479
Authorization: Bearer <admin token>
```

## Success — 200

```json
{
  "ok": true,
  "user": {
    "id": "1785686801756479",
    "globalName": "alice",
    "appNames": { "chat": "alice" },
    "permission": "admin",
    "online": true,
    "createdAt": 1785686860785,
    "lastOnlineAt": 1785686861000
  }
}
```

## Errors

| Status | Body error |
|--------|------------|
| 400 | `invalid user ID` |
| 403 | `admin access required` |
| 404 | `user not found` |
| 500 | `internal error` |
