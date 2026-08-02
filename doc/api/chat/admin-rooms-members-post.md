# POST /api/v1/admin/rooms/:id/members — Add Room Member (Admin)

Adds a user to a room. Requires an admin token. Idempotent
(`ON CONFLICT DO NOTHING` on the unique room+user index).

## Request

```json
{
  "userId": "1785686801756480"
}
```

| Field | Type | Required | Rules |
|-------|------|----------|-------|
| `userId` | string | Yes | User ID to add |

## Success — 201

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
| 400 | `userId required` |
| 403 | `admin access required` |
| 500 | error message |
