# GET /api/v1/health — Liveness (Chat Service)

Returns immediately without touching any dependency.

## Request

```
GET /api/v1/health
```

## Success — 200

```json
{
  "ok": true,
  "service": "chat-v1",
  "uptime": 123.4
}
```
