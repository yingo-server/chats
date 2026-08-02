# GET /api/v1/metrics — Service Metrics (Chat Service)

Returns process metrics. Unlike the User Service, this endpoint does **not**
require authentication.

## Request

```
GET /api/v1/metrics
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
