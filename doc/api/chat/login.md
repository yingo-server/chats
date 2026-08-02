# POST /api/v1/login — Login Proxy (Chat Service)

Forwards login requests to the User Service. Response is passed through
unchanged.

## Request

```json
{
  "username": "alice",
  "password": "s3cret-pass"
}
```

## Success

The User Service login response, e.g. 200 with

```json
{
  "ok": true,
  "user_id": "1785686801756479",
  "short_token": "...",
  "long_token": "...",
  "expires_in": 3600,
  "permission": "user"
}
```

## Errors

| Status | Body error |
|--------|------------|
| 400 | `username and password required` |
| 401 | `invalid username or password` |
| 429 | `too many login attempts, please try again later` |
| 502 | `user service unreachable` |

> See [User Service login](../user/login.md) for the full specification.
