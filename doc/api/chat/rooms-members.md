# GET /api/v1/rooms/:id/members — Room Members

Lists the member IDs of a room. Membership is required.

## Request

```
GET /api/v1/rooms/1785686860785123/members
Authorization: Bearer <token>
```

## Success — 200

```json
{
  "ok": true,
  "members": ["1785686801756479", "1785686801756480"],
  "total": 2
}
```

## Errors

| Status | Body error |
|--------|------------|
| 401 | `unauthorized` |
| 403 | `not a room member` |
| 404 | `room not found` |
| 500 | error message |
