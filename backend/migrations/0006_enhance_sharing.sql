ALTER TABLE sharing_links ADD COLUMN access_level TEXT DEFAULT 'both';
ALTER TABLE sharing_links ADD COLUMN password_hash TEXT;
ALTER TABLE sharing_links ADD COLUMN wrapped_key TEXT;
