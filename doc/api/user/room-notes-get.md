# GET /api/v1/me/room-notes — Own Room Notes

Lists all room notes of the authenticated user.

## Request

```
GET /api/v1/me/room-notes
Authorization: Bearer <token>
```

## Success — 200

```json
{
  "ok": true,
  "notes": [
    { "roomId": "1785686860785123", "note": "Team standup at 10:00" }
  ]
}
```

## Errors

| Status | Body error |
|--------|------------|
| 401 | `missing token` / `invalid token` |
| 500 | `internal error` |
