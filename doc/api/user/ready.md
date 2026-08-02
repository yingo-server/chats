# GET /api/v1/ready — Readiness

Checks the database connection (`SELECT 1`).

## Request

```
GET /api/v1/ready
```

## Success — 200

```json
{
  "ok": true,
  "service": "user-v1",
  "db": "ok"
}
```

When the database is unreachable:

```json
{
  "ok": false,
  "service": "user-v1",
  "db": "error"
}
```
