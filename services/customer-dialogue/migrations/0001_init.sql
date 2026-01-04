-- ai-assistant-sessions-db (archiwum sesji z Durable Object)
CREATE TABLE IF NOT EXISTS ai_sessions_archive (
    id TEXT PRIMARY KEY, -- ID sesji z Durable Object
    customer_id TEXT,
    start_time DATETIME NOT NULL,
    end_time DATETIME,
    messages JSON, -- Zbiór wiadomości z sesji, w tym image_data_base64
    metadata JSON,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_ai_sessions_customer_id ON ai_sessions_archive (customer_id);
CREATE INDEX IF NOT EXISTS idx_ai_sessions_start_time ON ai_sessions_archive (start_time);
