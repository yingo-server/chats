# POST /api/v1/media — Upload Media

Uploads an image, audio, video or file as a base64 data URL. Uploaded media is
stored as a binary blob in the `media` table and deduplicated by content sha256
(uploading identical bytes returns the existing row, idempotent).

Videos are transcoded to 480p (H.264 + AAC, MP4) via ffmpeg before storage;
if transcoding fails, the original bytes are kept.

## Request

```json
{
  "dataUrl": "data:image/png;base64,iVBORw0KGgo..."
}
```

| Field | Type | Required | Rules |
|-------|------|----------|-------|
| `dataUrl` | string | Yes | `data:<mime>;base64,<data>`; MIME must start with `image/`, `audio/`, `video/`, `application/` or `text/`; decoded size ≤ 30 MB |

## Success — 201

```json
{
  "ok": true,
  "media": {
    "id": "1785686860785123",
    "mimeType": "image/png",
    "size": 70,
    "sha256": "6b7fa434f92a8b80aab02d9bf1a12e49ffcae424e4013a1c4f68b67e3d2bbcd0",
    "ownerId": "1785686801756479",
    "createdAt": 1785686860785,
    "dataUrl": "data:image/png;base64,iVBORw0KGgo..."
  }
}
```

> When deduplication hits an existing row, `ownerId`/`createdAt` refer to the
> original uploader. A transcoded video returns `mimeType: "video/mp4"` with a
> reduced size.

## Errors

| Status | Body error |
|--------|------------|
| 400 | `dataUrl required` |
| 400 | `dataUrl must be a non-empty string` |
| 400 | `invalid dataUrl, expected data:<mime>;base64,<data>` |
| 400 | `unsupported mime type` |
| 400 | `media too large, max 31457280 bytes` |
| 400 | `media data is empty` |
| 401 | `unauthorized` |

## Notes

- The HTTP body limit is 40 MB (see [configuration](../../configuration.md)),
  which accommodates the worst-case base64 overhead of a 30 MB file.
- Media becomes referenced by messages through `mediaId`; see
  [Send Message](./rooms-messages-post.md).
