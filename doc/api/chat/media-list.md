# GET /api/v1/media — List Own Media

Lists the authenticated user's media (metadata only), newest first, cursor
paginated.

## Request

```
GET /api/v1/media?cursor=1785686860785123&limit=30
Authorization: Bearer <token>
```

| Query | Type | Default | Rules |
|-------|------|---------|-------|
| `cursor` | string | — | Media ID; returns rows with `id < cursor` |
| `limit` | number | 30 | 1–100 |

## Success — 200

```json
{
  "ok": true,
  "media": [
    {
      "id": "1785686860785123",
      "mimeType": "image/png",
      "size": 70,
      "sha256": "6b7fa434f92a8b80aab02d9bf1a12e49ffcae424e4013a1c4f68b67e3d2bbcd0",
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
| 401 | `unauthorized` |
| 500 | error message |
