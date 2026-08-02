# Event `v1:join` — Join a Room

Client subscribes to a room's message and presence broadcasts.

## Request

```json
{ "roomId": "1785686860785123" }
```

## Behavior

1. Validates that `roomId` is a non-empty string.
2. Checks membership via the database; non-members receive `v1:error` with
   `not a room member` and are not joined.
3. Joins the Socket.IO room.
4. Broadcasts `v1:online` `{ userId, online: true }` to the room.

## Errors

| `v1:error` message | Condition |
|--------------------|-----------|
| `invalid roomId` | Missing or non-string `roomId` |
| `not a room member` | Caller is not a member |
| `join failed` | Unexpected database error |
