# GET /admin — Ops Dashboard

Serves a server-side HTML dashboard page (not a JSON API). No REST route
documented for it beyond this page; it is rendered from
`chat/dashboard/index.html`.

## Request

```
GET /admin
```

## Success — 200

`text/html` page. When the dashboard depends on stats, it consumes the
[admin/stats](./admin-stats.md) endpoint from the browser.

## Notes

- No authentication is enforced on the page itself; sensitive actions must be
  performed through the authenticated admin APIs.