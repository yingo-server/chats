# DELETE /api/v1/admin/tokens/:id — Revoke Token (Admin)

Revokes any user's token. Requires an admin token.

## Request

```
DELETE /api/v1/admin/tokens/1785686860785123
Authorization: Bearer <admin token>
```

## Success — 200

```json
{
  "ok": true,
  "revoked": "1785686860785123"
}
```

## Errors

| Status | Body error |
|--------|------------|
| 400 | `invalid id` |
| 403 | `admin access required` |
| 404 | `token not found` |
| 500 | `internal error` |

## Notes

- The token verification cache is invalidated afterwards.
