# Event `v1:online` — Presence Broadcast (Server → Client)

Broadcast to a room when a member's online state changes.

## Payload

```json
{
  "userId": "1785686801756479",
  "online": true
}
```

## Triggered By

| Event | Payload |
|-------|---------|
| `v1:join` | `{ userId, online: true }` |
| `v1:leave` | `{ userId, online: false }` |
| `disconnect` (last device) | `{ userId, online: false }` |

## Notes

- A user with multiple connected sockets stays online until the last one
  disconnects (per-user socket set tracking).
- Online state is also mirrored in Redis as `online:<userId>` (TTL 120 s)
  and used by `GET /api/v1/admin/stats`.
