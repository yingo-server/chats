# DELETE /api/v1/rooms/:id — Delete a Direct Room or Leave a Group

| Room type | Behavior |
|-----------|----------|
| `direct` | The room is deleted entirely for both members |
| `group` | The caller leaves; if they were the last member the room is deleted |

## Request

```
DELETE /api/v1/rooms/1785686860785123
Authorization: Bearer <token>
```

## Success — 200

```json
{ "ok": true, "action": "deleted" }
```

or

```json
{ "ok": true, "action": "left" }
```

## Errors

| Status | Body error |
|--------|------------|
| 400 | `invalid id` (longer than 16 chars) |
| 401 | `unauthorized` |
| 403 | `not a room member` |
| 404 | `room not found` |
| 500 | error message |
