# POST /api/v1/admin/rooms/:id/messages — Send Message on Behalf (Admin)

Sends a message into any room on behalf of a specified sender, bypassing the
membership check. Requires an admin token.

## Request

```json
{
  "senderId": "1785686801756479",
  "content": "system notice",
  "type": "text",
  "mediaId": "1785686860785123"
}
```

| Field | Type | Required | Rules |
|-------|------|----------|-------|
| `senderId` | string | Yes | Existing user ID |
| `content` | string | At least one of `content`/`mediaId` | 1–10000 characters |
| `type` | string | No | Only `"text"` is accepted |
| `mediaId` | string | No | Existing media ID |

## Success — 201

```json
{
  "ok": true,
  "message": {
    "id": "1785686860785123",
    "roomId": "1785686860785123",
    "senderId": "1785686801756479",
    "senderName": "alice",
    "content": "system notice",
    "type": "text",
    "sentAt": 1785686860785,
    "mediaId": null,
    "mediaType": null
  }
}
```

The message is also broadcast to the room via Socket.IO (`v1:message`).

## Errors

| Status | Body error |
|--------|------------|
| 400 | `senderId required` |
| 400 | `content or mediaId required` |
| 403 | `admin access required` |
| 404 | `media not found` |
| 500 | error message |
