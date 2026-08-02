# GET /api/v1/admin/tokens — List Tokens (Admin)

Lists up to 200 tokens. Requires an admin token.

## Request

```
GET /api/v1/admin/tokens
Authorization: Bearer <admin token>
```

## Success — 200

```json
{
  "ok": true,
  "tokens": [
    {
      "id": "1785686860785123",
      "userId": "1785686801756479",
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
| 403 | `admin access required` |
| 500 | `internal error` |
