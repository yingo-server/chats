# GET /api/v1/tokens/me — Own Token List

Lists the tokens of the authenticated user.

## Request

```
GET /api/v1/tokens/me
Authorization: Bearer <token>
```

## Success — 200

```json
{
  "ok": true,
  "tokens": [
    {
      "id": "1785686860785123",
      "scopes": "",
      "shortExpires": 1785690461000,
      "longExpires": 1785678061000,
      "createdAt": 1785686860785,
      "revokedAt": null,
      "lastUsedAt": 1785686861000
    }
  ],
  "total": 1
}
```

## Errors

| Status | Body error |
|--------|------------|
| 401 | `missing token` / `invalid token` |
