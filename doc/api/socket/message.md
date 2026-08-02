# Event `v1:message` — Send / Receive a Message

## Client → Server

```json
{
  "roomId": "1785686860785123",
  "content": "hello",
  "type": "text",
  "mediaId": "1785686860785123"
}
```

An acknowledgement callback is invoked on completion.

| Ack | Meaning |
|-----|---------|
| `{ ok: true, msg: {...} }` | Message persisted and broadcast |
| `{ ok: false, error: "..." }` | Failure (see below) |

## Server → Client

The server broadcasts the safe message object to all members of the room
(see [Message Shape](./README.md#message-shape)).

## Validation

- `roomId` must be a non-empty string (`invalid roomId`).
- `content` must be a string (`content required`).
- At least one of `content` / `mediaId` must be present
  (`content or mediaId required`).
- Rate limit: 60 messages / 10 s (`rate limit exceeded, slow down`).
- In-flight limit: 50 (`too many pending messages`).
- Message content: 1–10000 characters; `type` must be `"text"`.
- Membership is checked; non-members get `not a room member`.
- `mediaId` must reference existing media (`media not found`).

## Errors

When no ack callback is supplied, failures are emitted as `v1:error`
with the same message strings.
