# DELETE /api/v1/admin/users/:id — Delete User (Admin)

Deletes a user. Protected by the last-admin rule: the final admin cannot be
deleted, and admins cannot delete themselves.

## Request

```
DELETE /api/v1/admin/users/1785686801756479
Authorization: Bearer <admin token>
```

## Success — 200

```json
{
  "ok": true,
  "deleted": "1785686801756479"
}
```

## Errors

| Status | Body error |
|--------|------------|
| 400 | `invalid id` |
| 400 | `cannot delete yourself` |
| 400 | `cannot delete the last admin` |
| 403 | `admin access required` |
| 404 | `user not found` |
| 500 | `internal error` |

## Notes

- Deleting a user also removes their tokens and API keys (cascade in `deleteUser`).
- The token verification cache is invalidated afterwards.
