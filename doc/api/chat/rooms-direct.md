# POST /api/v1/rooms/direct — Create a Direct Room

Creates (or returns) the direct room between the caller and another user.
Idempotent: one room per user pair, guaranteed by a Redis lock
(`lock:direct:<a>:<b>`, 8 s TTL, 25 retries).

## Request

```json
{
  "targetUserId": "1785686801756479"
}
```

| Field | Type | Required | Rules |
|-------|------|----------|-------|
| `targetUserId` | string | Yes | Must not equal the caller's ID |

## Success — 201

```json
{
  "ok": true,
  "room": {
    "id": "1785686860785123",
    "type": "direct",
    "name": null,
    "creatorId": "1785686801756479",
    "createdAt": 1785686860785,
    "memberIds": ["1785686801756479", "1785686801756480"],
    "memberNames": { "1785686801756479": "alice" }
  }
}
```

## Errors

| Status | Body error |
|--------|------------|
| 400 | `targetUserId required` |
| 400 | `cannot chat with self` |
| 401 | `unauthorized` |
| 500 | error message (e.g. `concurrent conflict, please retry`) |
