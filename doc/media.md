# Media

Media attachments (images, audio, video, files) are stored in a single `media`
table as binary blobs and attached to messages via `mediaId`.

## Upload Pipeline

```
POST /api/v1/media { dataUrl }
  │
  ├─ parse & validate (data URL syntax, MIME allow-list, size ≤ 30 MB)
  ├─ video? ─> ffmpeg transcode to 480p (H.264 + AAC, MP4, faststart)
  │             └─ on any failure: keep original bytes
  ├─ sha256(content) ─> lookup existing row (unique index)
  │             └─ hit: return existing row (idempotent, no new storage)
  ├─ insert bytea row
  └─ return { id, mimeType, size, sha256, ownerId, createdAt, dataUrl }
```

## Limits

| Limit | Value | Enforced in |
|-------|-------|-------------|
| Max media size | 30 MB (decoded) | `chat/src/utils.ts` (`MAX_MEDIA_BYTES`) |
| HTTP body limit | 40 MB | `chat/src/index.ts` (`bodyLimit`) |
| Request timeout | 60 s | `chat/src/index.ts` (`requestTimeout`) |
| MIME allow-list | `image/*`, `audio/*`, `video/*`, `application/*`, `text/*` | `parseDataUrl` |
| Message content | 10 000 chars | `sendMessage` |

## Deduplication

- Content-addressed: `sha256` unique index on the `media` table.
- Uploading identical bytes returns the **existing row** (including its
  original `ownerId`/`createdAt`); the deduplicated row is shared by reference
  via `mediaId` on messages.
- Race-safe: the unique index turns concurrent duplicate inserts into a lookup.

## Video Transcoding

- Triggered for any `video/*` MIME type during upload.
- ffmpeg arguments: `-vf scale=-2:480 -c:v libx264 -preset veryfast -crf 28
  -c:a aac -b:a 96k -movflags +faststart`, output `video/mp4`.
- Timeout: 45 s (`SIGKILL` on timeout); temp files in the OS temp dir are
  removed in `finally`.
- On any failure (missing ffmpeg, invalid file, timeout) the **original
  bytes are kept** — upload never fails because of transcoding.
- Requires ffmpeg in the container/`PATH`; the production image installs it via
  `apk add ffmpeg` (see `chat/Dockerfile`).
- Reference sizes: a 87.8 KB 1080p test clip → 42.5 KB 480p; a 44 KB 720p
  clip → 22.9 KB.

## Message Attachment

Messages reference media through `mediaId` and carry a coarse `mediaType`
(`image` / `audio` / `video` / `file`) derived from the MIME type at send time:

- `POST /api/v1/rooms/:id/messages` with `{ content?, mediaId }`
- `GET /api/v1/rooms/:id/messages?mediaType=image` filters history by type
- Socket `v1:message` accepts `mediaId` too

## Access Control

| Operation | Allowed for |
|-----------|-------------|
| Upload / list own | Any authenticated user |
| Read (JSON or raw) | Any authenticated user (raw has no owner check) |
| Delete | Owner, or admin (admin bypasses the reference check) |
| List all / force delete | Admin only |

Deleting media that is still referenced by a message returns `409 media is
referenced by messages`.

## Frontend Behavior

- One attachment button; accepted types: `image/*, audio/*, video/*,
  application/*, text/*`.
- Images are compressed client-side to 720p canvas before upload.
- Videos are never auto-loaded: a generic thumbnail with size is shown and
  playback starts on click; uploads show a fullscreen overlay for at least 7 s.
- Media is rendered via the `dataUrl` embedded in message payloads.
