# Yingo Frontend

React 19 + Vite + Tailwind CSS 4 + Zustand single-page application for
Yingo Server.

## Development

```bash
npm install
cp .env.example .env        # set VITE_USER_API / VITE_CHAT_API
npm run dev                 # Vite dev server (port 5173)
```

Quality gates:

```bash
npm run lint    # oxlint
npm run build   # tsc -b && vite build
```

## Production

Deployed by Netlify from the repository root (`netlify.toml`,
`publish = "frontend"`). API endpoints come from `VITE_USER_API` /
`VITE_CHAT_API`; on Netlify, configure them as environment variables in the
site settings (they override `frontend/.env` during builds).

## Documentation

See the repository documentation:

- [doc/](../doc/README.md) — documentation index
- [doc/api/](../doc/api/README.md) — REST + WebSocket API reference
