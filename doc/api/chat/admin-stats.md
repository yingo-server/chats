# GET /api/v1/admin/stats — Service Statistics (Admin)

Returns aggregate counters and the number of currently online users.
Requires an admin token.

## Request

```
GET /api/v1/admin/stats
Authorization: Bearer <admin token>
```

## Success — 200

```json
{
  "ok": true,
  "stats": {
    "rooms": 12,
    "members": 34,
    "coldMessages": 567,
    "onlineUsers": 3
  }
}
```

| Field | Source |
|-------|--------|
| `rooms` | `COUNT(*)` from `rooms` |
| `members` | `COUNT(*)` from `room_members` |
| `coldMessages` | `COUNT(*)` from `cold_messages` |
| `onlineUsers` | Number of `online:*` keys in Redis (SCAN, non-blocking) |

## Errors

| Status | Body error |
|--------|------------|
| 403 | `admin access required` |
| 500 | error message |
