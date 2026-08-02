-- ═══ Media support migration (incremental, idempotent) ═══
-- Run on the chat database (cold_chat):  docker exec -i chat-db psql -U yingo -d cold_chat < 0004_media.sql

-- Media blobs (images/audio/video/files), deduplicated by content sha256
CREATE TABLE IF NOT EXISTS media (
  id varchar(16) PRIMARY KEY,
  mime_type varchar(64) NOT NULL,
  data bytea NOT NULL,
  size integer NOT NULL,
  sha256 varchar(64) NOT NULL,
  owner_id varchar(16) NOT NULL,
  created_at bigint NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_media_sha256_unique ON media (sha256);

-- Message -> media reference (nullable: text messages have no media)
ALTER TABLE cold_messages ADD COLUMN IF NOT EXISTS media_id varchar(16);
ALTER TABLE cold_messages ADD COLUMN IF NOT EXISTS media_type varchar(8);

-- Fast "find messages of type X in room" lookup
CREATE INDEX IF NOT EXISTS idx_msg_media_room_type ON cold_messages (room_id, media_type, id DESC);

-- Grant privileges to the app user
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO coldchat;
GRANT USAGE ON SCHEMA public TO coldchat;
