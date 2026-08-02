# POST /api/v1/rooms/:id/messages — Send a Message

Sends a text message, optionally attached to media uploaded beforehand.
Membership is required. The message is written to the Redis hot zone first.

## Request

```json
{
  "content": "hello",
  "type": "text",
  "mediaId": "1785686860785123"
}
```

| Field | Type | Required | Rules |
|-------|------|----------|-------|
| `content` | string | At least one of `content`/`mediaId` | 1–10000 characters |
| `type` | string | No | Only `"text"` is accepted |
| `mediaId` | string | No | ID of an existing media row (16 chars max) |

## Success — 201

```json
{
  "ok": true,
  "message": {
    "id": "1785686860785123",
    "roomId": "1785686860785123",
    "senderId": "1785686801756479",
    "senderName": "alice",
    "senderAppName": "alice",
    "content": "hello",
    "type": "text",
    "sentAt": 1785686860785,
    "mediaId": "1785686860785123",
    "mediaType": "image",
    "recalled": false,
    "manuallyDeleted": false,
    "autoDeleted": false,
    "intervalSinceLast": null
  }
}
```

> `mediaType` is derived from the media MIME type (`image` / `audio` / `video` / `file`).
> The broadcast hook also emits `v1:message` to the room via Socket.IO.

## Errors

| Status | Body error |
|--------|------------|
| 400 | `content or mediaId required` |
| 400 | `content must be a string` |
| 400 | `invalid mediaId` |
| 400 | `content must be 1-10000 characters` |
| 400 | `type must be 'text'` |
| 401 | `unauthorized` |
| 403 | `not a room member` |
| 404 | `media not found` |
| 500 | error message |
