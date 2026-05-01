-- Security Audit Logging Table
CREATE TABLE IF NOT EXISTS security_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    event_type TEXT NOT NULL, -- 'login_failed', 'rate_limit_hit', 'mfa_failed', 'password_reset_request'
    ip_address TEXT NOT NULL,
    user_agent TEXT,
    metadata TEXT, -- JSON string for extra info
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_security_logs_user_id ON security_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_security_logs_ip ON security_logs(ip_address);
CREATE INDEX IF NOT EXISTS idx_security_logs_event ON security_logs(event_type);
