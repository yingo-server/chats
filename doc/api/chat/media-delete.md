# DELETE /api/v1/media/:id — Delete Media

Deletes a media row. The owner may delete their own media; an admin may delete
any media. Deleting media that is still referenced by messages returns `409`.

## Request

```
DELETE /api/v1/media/1785686860785123
Authorization: Bearer <token>
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
| 401 | `unauthorized` |
| 403 | `not the owner` (non-admin, not the owner) |
| 404 | `media not found` |
| 409 | `media is referenced by messages` (unless admin force path) |
| 500 | error message |

## Notes

- Admin deletes bypass the reference check entirely (force delete).
- `DELETE /api/v1/admin/media/:id` is the explicit admin force-delete endpoint.
