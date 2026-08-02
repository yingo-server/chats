# GET /api/v1/users/search — Search Users

Fuzzy username search on the global name. Requires authentication.
Returns at most 20 matches. Also exposed as a Chat Service proxy at
`GET /api/v1/users/search` (chat side).

## Request

```
GET /api/v1/users/search?query=ali
Authorization: Bearer <token>
```

| Query | Type | Required | Rules |
|-------|------|----------|-------|
| `query` | string | No | Trimmed; empty query returns `users: []` |

## Success — 200

```json
{
  "ok": true,
  "users": [
    { "id": "1785686801756479", "globalName": "alice", "appNames": { "chat": "alice" } }
  ]
}
```

## Errors

| Status | Body error |
|--------|------------|
| 401 | `missing token` / `invalid token` |
| 500 | `search failed` |

## Notes

- Uses `LIKE '%query%' ESCAPE '\'` with `%` escaped in the input.
- Empty or whitespace-only queries return an empty list without hitting the database.
