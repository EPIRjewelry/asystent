-- epir-web-pixel-events-db
CREATE TABLE IF NOT EXISTS pixel_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    event_type TEXT NOT NULL,
    customer_id TEXT,
    session_id TEXT, -- Dodano session_id
    url TEXT,         -- Dodano url
    payload JSON,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_pixel_events_type ON pixel_events (event_type);
CREATE INDEX IF NOT EXISTS idx_pixel_events_customer ON pixel_events (customer_id);
CREATE INDEX IF NOT EXISTS idx_pixel_events_session ON pixel_events (session_id); -- Dodano index
CREATE INDEX IF NOT EXISTS idx_pixel_events_created_at ON pixel_events (created_at); -- Zmieniono nazwę indeksu
