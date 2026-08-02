# PUT /api/v1/admin/users/:id/permission — Set User Permission (Admin)

Promotes or demotes a user. Protected by the last-admin rule: the final admin
cannot be demoted, and admins cannot demote themselves.

## Request

```json
{
  "permission": "admin"
}
```

| Field | Type | Required | Rules |
|-------|------|----------|-------|
| `permission` | string | Yes | `admin` or `user` |

## Success — 200

```json
{
  "ok": true,
  "userId": "1785686801756479",
  "permission": "admin"
}
```

## Errors

| Status | Body error |
|--------|------------|
| 400 | `permission must be 'admin' or 'user'` |
| 400 | `cannot demote yourself` |
| 400 | `cannot demote the last admin` |
| 400 | `invalid id` |
| 403 | `admin access required` |
| 404 | `user not found` |
| 500 | `internal error` |

## Notes

- The in-memory token verification cache is invalidated after the change,
  so the new permission takes effect immediately.
