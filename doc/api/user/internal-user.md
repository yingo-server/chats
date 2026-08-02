# GET /api/v1/internal/user/:id — Internal User Lookup

Service-to-service endpoint used by the Chat Service. Requires the
`x-internal-key` header matching `INTERNAL_API_KEY` (constant-time compare).

## Request

```
GET /api/v1/internal/user/1785686801756479
x-internal-key: <INTERNAL_API_KEY>
```

## Success — 200

```json
{
  "ok": true,
  "id": "1785686801756479",
  "name": "alice",
  "app_names": { "chat": "alice" }
}
```

## Errors

| Status | Body error |
|--------|------------|
| 400 | `invalid id` (not a string or longer than 16 chars) |
| 403 | `forbidden` (missing or mismatched internal key) |
| 404 | `{ "ok": false }` (user not found) |
