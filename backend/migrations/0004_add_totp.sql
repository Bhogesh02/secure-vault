-- Add TOTP support
ALTER TABLE users ADD COLUMN totp_secret TEXT;
ALTER TABLE users ADD COLUMN is_totp_enabled INTEGER DEFAULT 0;
