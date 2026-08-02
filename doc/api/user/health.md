# GET /api/v1/health — Liveness

Returns immediately without touching any dependency.

## Request

```
GET /api/v1/health
```

## Success — 200

```json
{
  "ok": true,
  "service": "user-v1",
  "uptime": 123.4
}
```
