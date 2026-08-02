# POST /api/v1/admin/rooms/group — Create Group Room (Admin)

Creates a group room with a specified creator. The admin is not added as a
member. Requires an admin token.

## Request

```json
{
  "creatorId": "1785686801756479",
  "name": "Team Chat",
  "memberIds": ["1785686801756480"]
}
```

| Field | Type | Required | Rules |
|-------|------|----------|-------|
| `creatorId` | string | Yes | Existing user ID; becomes the creator and first member |
| `name` | string | Yes | 1–64 characters |
| `memberIds` | string[] | No | Max 100 |

## Success — 201

```json
{
  "ok": true,
  "room": {
    "id": "1785686860785123",
    "type": "group",
    "name": "Team Chat",
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
| 400 | `creatorId required` |
| 400 | `name required` |
| 403 | `admin access required` |
| 500 | error message |
