# WebSocket Protocol — Socket.IO (Chat Service)

The Chat Service exposes realtime messaging over Socket.IO 4 on the same port
as the REST API.

## Connection

```
wss://server.344977.xyz:9001/socket.io
```

or locally:

```
ws://localhost:9001/socket.io
```

Handshake auth payload:

```json
{
  "token": "<long_token | short_token>",
  "user": { "id": "1785686801756479", "global_name": "alice", "app_names": { "chat": "alice" } }
}
```

- `token` is required; an invalid token rejects the connection with
  `Error: unauthorized`.
- Engine.IO defaults: `pingTimeout: 60000`, `pingInterval: 25000`.
- The official client should use `transports: ["websocket"]`; the production
  frontend does this (polling is supported but not used by the SPA).

## Events

| Event | Direction | Page |
|-------|-----------|------|
| `v1:join` | client → server | [join](./join.md) |
| `v1:leave` | client → server | [leave](./leave.md) |
| `v1:message` | client → server (with ack) | [message](./message.md) |
| `v1:message` | server → client | [message](./message.md) |
| `v1:online` | server → client | [online](./online.md) |
| `v1:error` | server → client | [error](./error.md) |
| `disconnect` | client → server | [disconnect](./disconnect.md) |

## Message Shape

The server emits `v1:message` to all members of a room as the message object
itself (the same shape returned by the REST POST endpoint):

```json
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
```

## Server Rules

- Socket rate limit: 60 `v1:message` events / 10 s per user.
- In-flight limit: max 50 concurrent pending `v1:message` acks per user
  (excess is rejected with `too many pending messages`).
- Presence: joining a room broadcasts the user as online; leaving/disconnecting
  broadcasts offline. Multi-device awareness keeps a user online until the
  last socket disconnects.
