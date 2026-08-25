-- Migration: 0002_auth_sessions.sql
-- Purpose: Adds session token storage for secure Web Crypto authentication & session revocation.

CREATE TABLE IF NOT EXISTS sessions (
  id                    TEXT PRIMARY KEY,               -- ses_01h...
  user_id               TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash            TEXT NOT NULL UNIQUE,
  expires_at            TEXT NOT NULL,
  created_at            TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_token ON sessions(token_hash);
