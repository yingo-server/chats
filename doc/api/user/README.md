# User Service — API Reference

The User Service (port 9000) owns accounts, authentication, tokens, API keys,
permissions, room notes and public profiles. It exposes 19 endpoints plus
health/ready/metrics. Internal lookups used by the Chat Service are gated by
`x-internal-key`.

## Endpoints

### Public

- [POST /api/v1/register](./register.md)
- [POST /api/v1/login](./login.md)
- [GET /api/v1/health](./health.md)
- [GET /api/v1/ready](./ready.md)

### Authenticated (Bearer token required)

- [GET /api/v1/verify](./verify.md)
- [GET /api/v1/users/me](./users-me.md)
- [GET /api/v1/users/:id](./users-id.md)
- [GET /api/v1/users/search](./users-search.md)
- [GET /api/v1/tokens/me](./tokens-me.md)
- [POST /api/v1/api-keys](./api-keys.md)
- [PUT /api/v1/me/room-notes/:roomId](./room-notes-put.md)
- [GET /api/v1/me/room-notes](./room-notes-get.md)

### Admin (admin token required)

- [GET /api/v1/admin/users](./admin-users.md)
- [GET /api/v1/admin/users/:id](./admin-users-id.md)
- [PUT /api/v1/admin/users/:id/permission](./admin-users-permission.md)
- [DELETE /api/v1/admin/users/:id](./admin-users-delete.md)
- [GET /api/v1/admin/tokens](./admin-tokens.md)
- [DELETE /api/v1/admin/tokens/:id](./admin-tokens-delete.md)
- [GET /api/v1/metrics](./metrics.md)

### Internal (x-internal-key required)

- [GET /api/v1/internal/user/:id](./internal-user.md)
