# Changelog

All notable changes to Yingo Server, newest first. Version scheme:
`<major>.<minor>-<stage>-<codename>`.

## v6.4.1 — 2026-08-03 (unreleased tag)

**Media expansion + video transcoding**

- Chat Service:
  - Media limit raised from 2 MB to **30 MB** (`MAX_MEDIA_BYTES`); HTTP
    `bodyLimit` raised to 40 MB; `requestTimeout` raised to 60 s.
  - New `chat/src/video.ts`: videos are transcoded to **480p** (H.264 + AAC,
    MP4 faststart) via ffmpeg during upload; original bytes are kept on any
    failure; 45 s timeout with SIGKILL.
  - `chat/Dockerfile`: installs ffmpeg in the runtime stage (Alpine `apk`).
- Frontend:
  - 30 MB limit (`lib/media.ts`).
  - Image + attach buttons merged into a single attachment button
    (`accept="image/*,audio/*,video/*,application/*,text/*"`).
  - Videos render a generic thumbnail with size; playback starts on click
    (no auto-load, no video thumbnails).
  - Video uploads show a fullscreen overlay (85% black, white spinner,
    "海内存知己，天涯若比邻") for at least 7 s.
  - Global font switched to Microsoft YaHei.
- Testing (`debug/delib.py`):
  - Oversize test now sends a 41 MB payload (expects 413 or connection abort).
  - Referenced-media delete test uses the actual owner (expects 409).
  - Socket media test pinned to the websocket transport.
  - Polling transport variants run once and are best-effort (production uses
    websocket only).
  - New `debug/run-tests.bat` launcher (UTF-8 console, Tee log to Desktop).
- Verified: 485/485 integration tests green locally; production media/video
  chain verified (720p 44 KB clip → 22.9 KB 480p).

## v6.4-stable-Whitenight — 2026-08-02

**Media attachments**

- New `media` table (bytea blobs) with sha256 content deduplication
  (unique index, race-safe idempotent uploads).
- `POST /api/v1/media`, `GET /api/v1/media` (own list),
  `GET /api/v1/media/:id` (`?raw=1` binary), `DELETE /api/v1/media/:id`
  (owner or admin; 409 while referenced).
- Admin: `GET /api/v1/admin/media` (ownerId filter),
  `DELETE /api/v1/admin/media/:id` (force delete).
- Messages carry `mediaId`/`mediaType`; history supports `?mediaType=` filters
  (index `idx_msg_media_room_type`); socket `v1:message` accepts `mediaId`.
- Frontend: media upload (images/audio/video/files), data-URL rendering,
  type filter chips, 2 MB limit.
- CI tags: `latest` + `v6.4-stable-Whitenight` + commit SHA.

## 6.3-stable-raw — 2026-08-02

**Room lifecycle + per-user notes**

- `DELETE /api/v1/rooms/:id`: direct rooms are deleted for both members;
  group members leave; the last member leaving deletes the room.
- `PUT /api/v1/me/room-notes/:roomId` + `GET /api/v1/me/room-notes`
  (per-user notes, empty note deletes, unique (user, room)).
- Frontend: room context menu (delete / set note / properties) with mobile
  long-press; note shown in sidebar + header; group names read-only with
  confirm dialog.
- Socket tests run over both polling and websocket transports.
- Admin promotion in the test runner; room/message list responses include
  `memberIds`/`memberNames`.
- Docs rewritten for 6.3 (API.md, README.md, DEPLOY.md incl. room_notes).

## 6.2-stable-law — 2026-08-02

**User search + English conversion**

- `GET /api/v1/users/search` (user service + chat proxy): fuzzy global-name
  search, max 20 results, `%`-escaped LIKE.
- Registration duplicate handling: `alice#2` suffix resolution with retry on
  concurrent name conflicts.
- Public user profile endpoint `GET /api/v1/users/:id`; DM member names in
  the room list.
- Frontend UX fixes: register 401 loop, history scroll, false logout, room
  load errors; DM search.
- Full English conversion; UTF-8 encoding fixes in the chat search proxy.
- P0 fixes: crashes, message whitespace handling, online-status optimization.

## v6.1-stable-law — 2026-08-01

**Hardening + CI**

- Security/stability hardening (23 fixes): token storage (short_lookup),
  constant-time compares, rate limiting, shutdown handling.
- Frontend UI consistency and multi-platform responsiveness.
- CI: GHCR login via `GHCR_PAT`, path-triggered workflows, `reset_db`
  auto-detects docker-compose container names.
- Test suite: iterations reduced to 3, alice promoted to admin in init,
  high-frequency login counts lowered (rate-limit safe).

## v5.9-alpha-bluesun-2 — 2026-08-01

- Security fixes + frontend improvements.
- React frontend scaffold replaces the old vanilla JS UI (backup tagged
  `v5.0-beta`).

## v5.0-beta — 2026-08-01

- Initial commit: Yingo chat backend — Fastify + Socket.IO + PostgreSQL +
  Redis, hot/cold message storage, token system, admin model.

---

## Maintenance Notes

- The repository history contains duplicate commits from repository
  synchronization (the git history was re-parented after a two-`.git` conflict;
  only one `.git` remains, pushed to `chats` and `chats-apps`).
- Test counts evolve with the suite: 412 → 485 (media suite + transport
  rules); unit suites: user 52, chat 52 (as of 6.4).
