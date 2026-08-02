# Event `v1:error` — Error Notification (Server → Client)

Emitted when an operation fails and no acknowledgement callback is available.

## Payload

```json
{
  "message": "not a room member"
}
```

## Possible Messages

| Message | Source |
|---------|--------|
| `invalid roomId` | `v1:join` / `v1:message` |
| `not a room member` | `v1:join` / `v1:message` |
| `join failed` | `v1:join` database error |
| `content required` / `content or mediaId required` | `v1:message` |
| `rate limit exceeded, slow down` | `v1:message` |
| `media not found` | `v1:message` with unknown `mediaId` |
| other message-send errors | `v1:message` persistence failures |
