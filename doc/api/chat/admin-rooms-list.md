# GET /api/v1/admin/rooms — List All Rooms (Admin)

Lists up to 200 rooms. Requires an admin token.

## Request

```
GET /api/v1/admin/rooms
Authorization: Bearer <admin token>
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
      "createdAt": 1785686860785
    }
  ],
  "total": 1
}
```

## Errors

| Status | Body error |
|--------|------------|
| 403 | `admin access required` |
| 500 | error message |
