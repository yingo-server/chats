# PUT /api/v1/me/room-notes/:roomId — Set a Room Note

Saves a private note for a room. Notes are strictly per-user and never visible
to other members. An empty string deletes the note.

## Request

```
PUT /api/v1/me/room-notes/1785686860785123
Authorization: Bearer <token>

{ "note": "Team standup at 10:00" }
```

| Field | Type | Required | Rules |
|-------|------|----------|-------|
| `note` | string | Yes | 1–64 characters; empty string deletes |

## Success — 200

```json
{
  "ok": true,
  "roomId": "1785686860785123",
  "note": "Team standup at 10:00"
}
```

Deletion (empty note):

```json
{ "ok": true, "roomId": "1785686860785123", "note": null }
```

## Errors

| Status | Body error |
|--------|------------|
| 400 | `note must be a string` |
| 400 | `invalid roomId` / `note must be 1-64 characters` |
| 401 | `missing token` / `invalid token` |
| 500 | `failed to save note` |
