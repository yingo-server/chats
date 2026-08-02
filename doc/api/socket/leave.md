# Event `v1:leave` — Leave a Room

Client unsubscribes from a room's broadcasts.

## Request

```json
{ "roomId": "1785686860785123" }
```

## Behavior

1. Leaves the Socket.IO room (missing/invalid `roomId` is ignored).
2. Broadcasts `v1:online` `{ userId, online: false }` to the room.

No error event is emitted; leaving a room you are not in is a no-op.
