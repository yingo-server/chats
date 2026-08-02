# Chat Service — API Reference

The Chat Service (port 9001) owns rooms, messages, media and the WebSocket
realtime channel. It proxies login and user search to the User Service. It
exposes 29 endpoints plus health/ready/metrics, and the Socket.IO protocol.
An ops dashboard HTML page is served at [`GET /admin`](./admin-dashboard.md).

## Endpoints

### Room management (Bearer token required)

- [POST /api/v1/rooms/direct](./rooms-direct.md)
- [POST /api/v1/rooms/group](./rooms-group.md)
- [GET /api/v1/rooms](./rooms-list.md)
- [GET /api/v1/rooms/:id](./rooms-detail.md)
- [GET /api/v1/rooms/:id/members](./rooms-members.md)
- [DELETE /api/v1/rooms/:id](./rooms-delete.md)

### Messages (Bearer token required)

- [GET /api/v1/rooms/:id/messages](./rooms-messages-get.md)
- [POST /api/v1/rooms/:id/messages](./rooms-messages-post.md)

### Media (Bearer token required)

- [POST /api/v1/media](./media-post.md)
- [GET /api/v1/media](./media-list.md)
- [GET /api/v1/media/:id](./media-get.md)
- [DELETE /api/v1/media/:id](./media-delete.md)

### Proxy to User Service

- [POST /api/v1/login](./login.md)
- [GET /api/v1/users/search](./users-search.md)

### Health, readiness, metrics

- [GET /api/v1/health](./health.md)
- [GET /api/v1/ready](./ready.md)
- [GET /api/v1/metrics](./metrics.md)

### Admin (admin token required)

- [GET /api/v1/admin/rooms](./admin-rooms-list.md)
- [GET /api/v1/admin/rooms/:id/members](./admin-rooms-members.md)
- [GET /api/v1/admin/rooms/:id/messages](./admin-rooms-messages-get.md)
- [POST /api/v1/admin/rooms/:id/messages](./admin-rooms-messages-post.md)
- [POST /api/v1/admin/rooms/direct](./admin-rooms-direct.md)
- [POST /api/v1/admin/rooms/group](./admin-rooms-group.md)
- [POST /api/v1/admin/rooms/:id/members](./admin-rooms-members-post.md)
- [DELETE /api/v1/admin/rooms/:roomId/members/:userId](./admin-rooms-members-delete.md)
- [GET /api/v1/admin/stats](./admin-stats.md)
- [DELETE /api/v1/admin/rooms/:id](./admin-rooms-delete.md)
- [GET /api/v1/admin/media](./admin-media-list.md)
- [DELETE /api/v1/admin/media/:id](./admin-media-delete.md)

## WebSocket

- [WebSocket Protocol](../socket/README.md)
