# GET /api/v1/rooms/:id/messages — Message History

Returns messages of a room, merged from the Redis hot zone and the PostgreSQL
cold zone. Cursor pagination, newest first, no duplicates. Membership required.

## Request

```
GET /api/v1/rooms/1785686860785123/messages?cursor=1785686860785100&limit=30&mediaType=image
Authorization: Bearer <token>
```

| Query | Type | Default | Rules |
|-------|------|---------|-------|
| `cursor` | string | — | Message ID; returns messages with `id < cursor` |
| `limit` | number | 30 | 1–100 |
| `mediaType` | string | — | `image`, `audio`, `video` or `file` (filters media messages) |

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
      "senderAppName": "alice",
      "content": "hello",
      "type": "text",
      "sentAt": 1785686860785,
      "mediaId": null,
      "mediaType": null,
      "recalled": false,
      "manuallyDeleted": false,
      "autoDeleted": false
    }
  ],
  "cursor": "1785686860785123",
  "hasMore": true
}
```

> `cursor` is present only when `hasMore` is true. The `senderIp` field is
> stripped from all API responses (`sanitizeMessage`). Messages still in the
> Redis hot zone additionally carry `intervalSinceLast` (ms since the previous
> message in the room, `null` when older than 5 minutes); cold-zone messages
> never include it.

## Errors

| Status | Body error |
|--------|------------|
| 400 | `limit must be 1-100` |
| 400 | `mediaType must be one of image/audio/video/file` |
| 401 | `unauthorized` |
| 403 | `not a room member` |
| 500 | error message |
