-- Add room_notes table: per-user per-room notes (visible only to the owner)
-- Run this against cold_user before deploying the new code.

CREATE TABLE IF NOT EXISTS room_notes (
  id varchar(16) PRIMARY KEY,
  user_id varchar(16) NOT NULL REFERENCES users(id),
  room_id varchar(16) NOT NULL,
  note varchar(64) NOT NULL,
  updated_at bigint NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_room_notes_user_room_unique ON room_notes (user_id, room_id);
CREATE INDEX IF NOT EXISTS idx_room_notes_user_id ON room_notes (user_id);