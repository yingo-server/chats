# POST /api/v1/rooms/group — Create a Group Room

Creates a group room. The creator becomes the first member; the group name is
permanent (read-only in the UI).

## Request

```json
{
  "name": "Team Chat",
  "memberIds": ["1785686801756479", "1785686801756480"]
}
```

| Field | Type | Required | Rules |
|-------|------|----------|-------|
| `name` | string | No | 1–64 characters |
| `memberIds` | string[] | No | Max 100; duplicates and the creator are filtered out |

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
| 400 | `name must be string` |
| 400 | `memberIds must be array` |
| 400 | `memberIds max 100` |
| 401 | `unauthorized` |
| 500 | error message |
