# GET /api/v1/rooms — My Room List

Lists all rooms the caller is a member of, with member IDs and names attached.

## Request

```
GET /api/v1/rooms
Authorization: Bearer <token>
```

## Success — 200

```json
{
  "ok": true,
  "rooms": [
    {
      "id": "1785686860785123",
      "type": "direct",
      "name": null,
      "creatorId": "1785686801756479",
      "createdAt": 1785686860785,
      "memberIds": ["1785686801756479", "1785686801756480"],
      "memberNames": { "1785686801756480": "bob" }
    }
  ]
}
```

## Errors

| Status | Body error |
|--------|------------|
| 401 | `unauthorized` |
| 500 | error message |
