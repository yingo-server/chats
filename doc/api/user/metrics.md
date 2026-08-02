# GET /api/v1/metrics — Service Metrics (Admin)

Returns process metrics. Requires an admin token.

## Request

```
GET /api/v1/metrics
Authorization: Bearer <admin token>
```

## Success — 200

```json
{
  "ok": true,
  "uptime": 123.4,
  "memory": {
    "rss": 49152000,
    "heapTotal": 33554432,
    "heapUsed": 20971520,
    "external": 1048576,
    "arrayBuffers": 524288
  },
  "pid": 1
}
```

## Errors

| Status | Body error |
|--------|------------|
| 403 | `admin access required` |
