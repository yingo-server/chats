# Security

## Transport

- Helmet headers (CSP disabled intentionally; HSTS, X-Frame-Options, MIME
  sniffing protection enabled) on both services.
- Optional HTTPS (`SSL_CERT` / `SSL_KEY`); production runs TLS-terminated
  services with `NODE_TLS_REJECT_UNAUTHORIZED=0` only between trusted services.
- CORS restricted to configured origins (plus the `*.344977.xyz` family regex)
  with credentials.
- `trustProxy: true` — the first `x-forwarded-for` entry is used for login
  rate limiting.

## Passwords

- Per-user random salt (16 bytes hex).
- `HMAC-SHA256(PEPPER_SECRET, salt + password)` — peppered and salted;
  stored as `salt:hash`.
- Login validation is constant-time-ish via HMAC and a single lookup;
  wrong-credential responses are indistinguishable between "no such user"
  and "wrong password".

## Tokens

- `short_token` (32 hex, 1 h) and `long_token` (64 hex, 30 d) are 128/256-bit
  random values returned once.
- Only salted HMAC hashes are stored; lookups go through SHA-256 index columns.
- Verification has a 10 s in-memory cache, invalidated immediately on
  permission changes / revocation / deletion.
- Expired and revoked tokens are purged by a background cleaner.

## API Keys

- 128-bit random, prefix-stored hash (`mk-` / `rk-`), per-key rate limit.
- The raw key is returned exactly once at creation.

## Rate Limiting

- Login: 30 / 60 s per IP (in-memory, expiry cleanup every 5 min).
- Socket sends: 60 / 10 s per user (Redis).
- API keys: per-key limit, default 100 req/min.

## Authorization

- Bearer tokens verified on every request; admin endpoints additionally check
  `permission === "admin"`.
- Room membership is enforced on messages, history, room detail/members.
- The Chat Service never trusts the client for user identity; sender identity
  comes from the verified token.
- Service-to-service calls use `x-internal-key` with constant-time compare.

## Admin Safety

- First user on an empty DB becomes admin (advisory-lock serialized).
- Last-admin protection: the final admin cannot be demoted or deleted.
- An admin cannot demote or delete themselves.

## Media Safety

- MIME allow-list (`image/audio/video/application/text`).
- Size cap (30 MB decoded) with a matching 40 MB body limit.
- Videos are re-encoded to 480p H.264/AAC — no exotic codecs are persisted.
- Data URLs are base64-decoded server-side; `mediaToDataUrl` re-encodes for
  clients (no user-supplied MIME sniffing at render time beyond the allow-list).

## Resilience

- Message persistence never loses data: Redis write failure falls back to a
  direct PostgreSQL insert.
- Redis AOF enabled in production; hot zone is a cache, cold zone is the
  source of truth.
- Graceful shutdown (8 s watchdog), fatal logging for uncaught errors.
- Request IDs are attached to every request for tracking.
