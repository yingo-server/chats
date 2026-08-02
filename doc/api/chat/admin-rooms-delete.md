# DELETE /api/v1/admin/rooms/:id — Delete Room (Admin)

Deletes a room and its membership rows. Requires an admin token.

## Request

```
DELETE /api/v1/admin/rooms/1785686860785123
Authorization: Bearer <admin token>
```

## Success — 200

```json
{
  "ok": true,
  "deleted": "1785686860785123"
}
```

## Errors

| Status | Body error |
|--------|------------|
| 400 | `invalid id` (longer than 16 chars) |
| 403 | `admin access required` |
| 404 | `room not found` |
| 500 | error message |
