# GET /api/v1/admin/rooms/:id/members — All Room Members (Admin)

Lists the membership rows of a room. Requires an admin token; no membership
check is applied.

## Request

```
GET /api/v1/admin/rooms/1785686860785123/members
Authorization: Bearer <admin token>
```

## Success — 200

```json
{
  "ok": true,
  "members": [
    { "id": "1785686860785999", "roomId": "1785686860785123", "userId": "1785686801756479", "joinedAt": 1785686860785 }
  ],
  "total": 1
}
```

## Errors

| Status | Body error |
|--------|------------|
| 403 | `admin access required` |
| 500 | error message |
