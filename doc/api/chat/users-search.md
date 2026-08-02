# GET /api/v1/users/search — User Search Proxy (Chat Service)

Forwards the query and the caller's token to the User Service search endpoint.

## Request

```
GET /api/v1/users/search?query=ali
Authorization: Bearer <token>
```

## Success — 200

```json
{
  "ok": true,
  "users": [
    { "id": "1785686801756479", "global_name": "alice", "app_names": { "chat": "alice" } }
  ]
}
```

Empty query:

```json
{ "ok": true, "users": [] }
```

## Errors

| Status | Body error |
|--------|------------|
| 401 | `unauthorized` |

> See [User Service search](../user/users-search.md) for the full specification.
