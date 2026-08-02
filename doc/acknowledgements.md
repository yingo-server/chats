# Acknowledgements

Yingo Server is built on the shoulders of many open-source projects. We thank
every maintainer and contributor. The project itself is licensed under the
**GNU Affero General Public License v3.0** (AGPL-3.0) — see the repository
`LICENSE` file.

## Runtime Dependencies

### User Service & Chat Service (Node.js)

| Package | Version | License |
|---------|---------|---------|
| [fastify](https://github.com/fastify/fastify) | 4.x | MIT |
| [@fastify/cors](https://github.com/fastify/fastify-cors) | 9.x | MIT |
| [@fastify/helmet](https://github.com/fastify/fastify-helmet) | 11.x | MIT |
| [drizzle-orm](https://github.com/drizzle-team/drizzle-orm) | 0.33 | Apache-2.0 |
| [ioredis](https://github.com/redis/ioredis) | 5.x | MIT |
| [pino](https://github.com/pinojs/pino) | 9.x | MIT |
| [postgres](https://github.com/porsager/postgres) (postgres.js) | 3.x | Unlicense |
| [socket.io](https://github.com/socketio/socket.io) | 4.x | MIT |
| [undici](https://github.com/nodejs/undici) | 6.x | MIT |
| [tsx](https://github.com/privatenumber/tsx) | 4.x | MIT |
| [typescript](https://github.com/microsoft/TypeScript) | 5.x | Apache-2.0 |
| [vitest](https://github.com/vitest-dev/vitest) | 4.x | MIT |
| [@types/node](https://github.com/DefinitelyTyped/DefinitelyTyped) | 20.x | MIT |
| [drizzle-kit](https://github.com/drizzle-team/drizzle-kit) | 0.24 | Apache-2.0 |

### Frontend (React SPA)

| Package | Version | License |
|---------|---------|---------|
| [react](https://github.com/facebook/react) / react-dom | 19.x | MIT |
| [vite](https://github.com/vitejs/vite) | 8.x | MIT |
| [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react) | 6.x | MIT |
| [tailwindcss](https://github.com/tailwindlabs/tailwindcss) | 4.x | MIT |
| [@tailwindcss/vite](https://github.com/tailwindlabs/tailwindcss) | 4.x | MIT |
| [zustand](https://github.com/pmndrs/zustand) | 5.x | MIT |
| [socket.io-client](https://github.com/socketio/socket.io-client) | 4.x | MIT |
| [react-router](https://github.com/remix-run/react-router) | 8.x | MIT |
| [@radix-ui/react-\*](https://github.com/radix-ui/primitives) | 1.x | MIT |
| [lucide-react](https://github.com/lucide-icons/lucide) | 1.x | ISC |
| [next-themes](https://github.com/pacocoursey/next-themes) | 0.4 | MIT |
| [clsx](https://github.com/lukeed/clsx) | 2.x | MIT |
| [class-variance-authority](https://github.com/joe-bell/cva) | 0.7 | Apache-2.0 |
| [tailwind-merge](https://github.com/dcastil/tailwind-merge) | 3.x | MIT |
| [oxlint](https://github.com/oxc-project/oxc) | 1.x | MIT |
| [@types/react](https://github.com/DefinitelyTyped/DefinitelyTyped) | 19.x | MIT |

### Testing (Python)

| Package | License |
|---------|---------|
| [requests](https://github.com/psf/requests) | Apache-2.0 |
| [python-socketio](https://github.com/miguelgrinberg/python-socketio) | MIT |
| [python-engineio](https://github.com/miguelgrinberg/python-engineio) | MIT |
| [urllib3](https://github.com/urllib3/urllib3) | MIT |

## Platform & Infrastructure

| Component | License |
|-----------|---------|
| [Node.js](https://github.com/nodejs/node) | MIT |
| [PostgreSQL](https://www.postgresql.org/) | PostgreSQL License |
| [Redis](https://github.com/redis/redis) | BSD-3-Clause |
| [ffmpeg](https://ffmpeg.org/) | LGPL-2.1-or-later (with GPL components; unmodified system build) |
| [Docker](https://www.docker.com/) | Apache-2.0 (open-source components) |
| [GitHub Actions](https://github.com/features/actions) | Hosted service |
| [GitHub Container Registry](https://ghcr.io) | Hosted service |
| [Netlify](https://www.netlify.com/) | Hosted service |
| [Alpine Linux](https://alpinelinux.org/) | MIT (base images) |

## License Compatibility

All dependencies are permissive or copyleft-weak (MIT, Apache-2.0, ISC, BSD,
Unlicense, PostgreSQL License, LGPL for ffmpeg). None of them impose
restrictions on distributing this project under AGPL-3.0. Dynamic invocation
of the system ffmpeg binary does not create a derivative work under the GPL
family; users may swap the build for a fully LGPL ffmpeg if preferred.

## Our Own Components

| Component | License |
|-----------|---------|
| Yingo Server (this repository: user/, chat/, frontend/, debug/, doc/) | AGPL-3.0 |

## Special Thanks

- The Fastify and Socket.IO communities for the core realtime plumbing.
- The Drizzle team for the type-safe ORM.
- The Radix UI, Tailwind CSS and Vite ecosystems for the frontend foundation.
- The python-socketio and requests maintainers for the test framework.
- All bug reporters and contributors who helped shape versions 5.0 → 6.4.
