# API Conventions

Shared conventions for all Yingo Server APIs. Read this first.

## Base URLs

| Environment | User Service | Chat Service |
|-------------|--------------|--------------|
| Production | `https://server.344977.xyz:9000` | `https://server.344977.xyz:9001` |
| Local | `http://localhost:9000` | `http://localhost:9001` |

## Authentication

Most endpoints require an access token:

```
Authorization: Bearer <short_token | long_token | api_key>
```

| Token type | Format | Validity |
|------------|--------|----------|
| `short_token` | 32 hex chars | 1 hour |
| `long_token` | 64 hex chars | 30 days |
| `api_key` | `mk-` / `rk-` prefix | 7 / 30 / 60 / 90 / 180 days |

- Service-to-service calls use the `x-internal-key` header instead of a token.
- Admin endpoints additionally require the token's `permission` to be `admin`.
- The first registered user on an empty database automatically becomes `admin`
  (decided inside a transaction with a PostgreSQL advisory lock).
- Missing/invalid tokens return `401`; valid tokens without sufficient permission
  return `403`.

## Response Format

Success: `{ "ok": true, ...fields }`

Errors: `{ "ok": false, "error": "<message>" }`

## HTTP Status Codes

| HTTP | Meaning |
|------|---------|
| 200 | Success |
| 201 | Created |
| 400 | Invalid parameters or validation failure |
| 401 | Missing or invalid token / credentials |
| 403 | Forbidden (insufficient permission / not a room member) |
| 404 | Resource not found |
| 409 | Conflict (e.g. media still referenced by messages) |
| 429 | Rate limited |
| 500 | Internal error |
| 502 | Upstream service unreachable (chat → user proxy) |

## Rate Limiting

- **Login**: 30 attempts / 60 s per IP (configurable via `LOGIN_RATE_LIMIT` /
  `LOGIN_RATE_WINDOW`), enforced in-memory per IP.
- **Socket messages**: 60 messages / 10 s per user (`ratelimit:msg:<uid>` in Redis).
- **API keys**: per-key `rate_limit` (default 100 req/min, `-1` = unlimited).

## IDs

All resource IDs (`user`, `room`, `message`, `media`, `token`, `api_key`) are
16-character numeric strings generated with timestamp + random padding.
Cursor pagination sorts IDs in descending order (`id < cursor`).

## Verified With

Every endpoint is covered by the integration suite (`debug/delib.py`,
25 suites / 485 test cases) against both local and production deployments.
