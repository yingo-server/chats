# GET /api/v1/admin/rooms/:id/messages — Room Messages (Admin)

Returns message history of any room, bypassing the membership check.
Requires an admin token.

## Request

```
GET /api/v1/admin/rooms/1785686860785123/messages?cursor=...&limit=30&mediaType=video
Authorization: Bearer <admin token>
```

| Query | Type | Default | Rules |
|-------|------|---------|-------|
| `cursor` | string | — | Message ID; returns messages with `id < cursor` |
| `limit` | number | 30 | 1–100 |
| `mediaType` | string | — | `image`, `audio`, `video` or `file` |

## Success — 200

```json
{
  "ok": true,
  "items": [
    {
      "id": "1785686860785123",
      "roomId": "1785686860785123",
      "senderId": "1785686801756479",
      "senderName": "alice",
      "content": "hello",
      "type": "text",
      "sentAt": 1785686860785,
      "mediaId": null,
      "mediaType": null
    }
  ],
  "cursor": "1785686860785123",
  "hasMore": false
}
```

## Errors

| Status | Body error |
|--------|------------|
| 400 | `limit must be 1-100` |
| 400 | `mediaType must be one of image/audio/video/file` |
| 403 | `admin access required` |
| 500 | error message |
