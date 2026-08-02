# GET /api/v1/ready — Readiness (Chat Service)

Checks both PostgreSQL (`SELECT 1`) and Redis (`PING`).

## Request

```
GET /api/v1/ready
```

## Success — 200

```json
{
  "ok": true,
  "service": "chat-v1",
  "db": "ok",
  "redis": "ok"
}
```

When a dependency is unreachable:

```json
{
  "ok": false,
  "service": "chat-v1",
  "db": "error",
  "redis": "ok"
}
```
