# DELETE /api/v1/admin/rooms/:roomId/members/:userId — Remove Room Member (Admin)

Removes a user from a room. Requires an admin token.

## Request

```
DELETE /api/v1/admin/rooms/1785686860785123/members/1785686801756480
Authorization: Bearer <admin token>
```

## Success — 200

```json
{
  "ok": true,
  "roomId": "1785686860785123",
  "userId": "1785686801756480"
}
```

## Errors

| Status | Body error |
|--------|------------|
| 403 | `admin access required` |
| 500 | error message |
