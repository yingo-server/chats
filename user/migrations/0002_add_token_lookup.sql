-- Add tokenLookup column for O(1) token verification
-- Run this migration before deploying the new code

-- Step 1: Add the column (nullable first for existing rows)
ALTER TABLE tokens ADD COLUMN token_lookup varchar(64);

-- Step 2: Backfill existing tokens with SHA-256 of long token
-- Note: Existing tokens cannot be backfilled without knowing the raw token.
-- Old tokens will fail verification until users re-login.
-- This is acceptable as tokens expire anyway (short=1h, long=30d).

-- Step 3: Make NOT NULL and add unique index
ALTER TABLE tokens ALTER COLUMN token_lookup SET NOT NULL;
ALTER TABLE tokens ADD CONSTRAINT uq_tokens_lookup UNIQUE (token_lookup);
CREATE INDEX idx_tokens_lookup ON tokens (token_lookup);
