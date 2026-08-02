# DELETE /api/v1/admin/media/:id — Force-Delete Media (Admin)

Deletes any media row, ignoring message references. Requires an admin token.

## Request

```
DELETE /api/v1/admin/media/1785686860785123
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
| 404 | `media not found` |
| 500 | error message |
