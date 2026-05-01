-- Add security and sharing features
ALTER TABLE users ADD COLUMN failed_attempts INTEGER DEFAULT 0;
ALTER TABLE users ADD COLUMN max_failed_attempts INTEGER DEFAULT 5;
ALTER TABLE users ADD COLUMN dead_man_email TEXT;
ALTER TABLE users ADD COLUMN dead_man_days INTEGER DEFAULT 30;
ALTER TABLE users ADD COLUMN last_active_at DATETIME;
ALTER TABLE users ADD COLUMN is_locked INTEGER DEFAULT 0;

CREATE TABLE security_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    event_type TEXT NOT NULL,
    ip_address TEXT,
    user_agent TEXT,
    details TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE sharing_links (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    file_id INTEGER,
    folder_id INTEGER,
    token TEXT UNIQUE NOT NULL,
    is_one_time INTEGER DEFAULT 1,
    expires_at DATETIME NOT NULL,
    accessed_count INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (file_id) REFERENCES files(id),
    FOREIGN KEY (folder_id) REFERENCES folders(id)
);

CREATE INDEX idx_security_logs_user ON security_logs(user_id);
CREATE INDEX idx_sharing_links_token ON sharing_links(token);
