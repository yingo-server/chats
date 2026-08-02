# GET /api/v1/media/:id — Get Media

Returns media metadata with embedded `dataUrl`, or the raw binary bytes with
`?raw=1`.

## Request

```
GET /api/v1/media/1785686860785123
Authorization: Bearer <token>
```

With raw output:

```
GET /api/v1/media/1785686860785123?raw=1
```

## Success — 200 (JSON)

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

## Success — 200 (raw, `?raw=1` or `?raw=true`)

The binary payload with `Content-Type: <mimeType>` (e.g. `image/png`,
`video/mp4`). `raw` has no access control beyond authentication.

## Errors

| Status | Body error |
|--------|------------|
| 401 | `unauthorized` |
| 404 | `media not found` |
| 500 | error message |
