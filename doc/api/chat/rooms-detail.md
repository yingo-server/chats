# GET /api/v1/rooms/:id — Room Detail

Returns one room with its member IDs. Membership is required.

## Request

```
GET /api/v1/rooms/1785686860785123
Authorization: Bearer <token>
```

## Success — 200

```json
{
  "ok": true,
  "room": {
    "id": "1785686860785123",
    "type": "direct",
    "name": null,
    "creatorId": "1785686801756479",
    "createdAt": 1785686860785,
    "memberIds": ["1785686801756479", "1785686801756480"]
  }
}
```

> Member display names are resolved by the client via
> [users/search](./users-search.md); this endpoint returns IDs only.

## Errors

| Status | Body error |
|--------|------------|
| 401 | `unauthorized` |
| 403 | `not a room member` |
| 404 | `room not found` |
| 500 | error message |
