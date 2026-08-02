# GET /api/v1/admin/users — List Users (Admin)

Lists up to 200 users. Requires an admin token.

## Request

```
GET /api/v1/admin/users
Authorization: Bearer <admin token>
```

## Success — 200

```json
{
  "ok": true,
  "users": [
    {
      "id": "1785686801756479",
      "globalName": "alice",
      "appNames": { "chat": "alice" },
      "permission": "admin",
      "online": true,
      "createdAt": 1785686860785,
      "lastOnlineAt": 1785686861000
    }
  ],
  "total": 1
}
```

## Errors

| Status | Body error |
|--------|------------|
| 403 | `admin access required` |
| 500 | `internal error` |
