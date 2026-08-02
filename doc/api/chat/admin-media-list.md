# GET /api/v1/admin/media — List All Media (Admin)

Lists media across all users with an optional `ownerId` filter. Metadata only.
Requires an admin token.

## Request

```
GET /api/v1/admin/media?cursor=1785686860785123&limit=30&ownerId=1785686801756479
Authorization: Bearer <admin token>
```

| Query | Type | Default | Rules |
|-------|------|---------|-------|
| `cursor` | string | — | Media ID; returns rows with `id < cursor` |
| `limit` | number | 30 | 1–100 |
| `ownerId` | string | — | Restrict to one owner |

## Success — 200

```json
{
  "ok": true,
  "media": [
    {
      "id": "1785686860785123",
      "mimeType": "video/mp4",
      "size": 22867,
      "sha256": "aa01def6f578...",
      "ownerId": "1785686801756479",
      "createdAt": 1785686860785
    }
  ],
  "total": 1
}
```

## Errors

| Status | Body error |
|--------|------------|
| 400 | `limit must be 1-100` |
| 403 | `admin access required` |
| 500 | error message |
