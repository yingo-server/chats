# POST /api/v1/admin/rooms/direct — Create Direct Room (Admin)

Creates (or returns) the direct room between two arbitrary users. The admin is
not added as a member. Requires an admin token.

## Request

```json
{
  "userA": "1785686801756479",
  "userB": "1785686801756480"
}
```

| Field | Type | Required | Rules |
|-------|------|----------|-------|
| `userA` | string | Yes | First user ID |
| `userB` | string | Yes | Second user ID; must differ from `userA` |

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
    "memberNames": {}
  }
}
```

## Errors

| Status | Body error |
|--------|------------|
| 400 | `userA and userB required` |
| 400 | `cannot chat with self` |
| 403 | `admin access required` |
| 500 | error message |
