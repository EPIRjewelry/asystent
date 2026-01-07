-- Czyścimy starą, prostą tabelę (UWAGA: to usunie dotychczasowe testowe eventy z V2!)
DROP TABLE IF EXISTS pixel_events;

-- 1. Główna tabela zdarzeń (Pełne spektrum V1: 40+ kolumn)
CREATE TABLE pixel_events (
  id TEXT PRIMARY KEY,
  event_type TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now')),
  customer_id TEXT,
  session_id TEXT,
  page_url TEXT,
  product_id TEXT,
  product_title TEXT,
  cart_total REAL,
  raw_data TEXT, -- Pełny JSON na wszelki wypadek
  
  -- Dane pod heatmapy (UX)
  click_x INTEGER,
  click_y INTEGER,
  scroll_depth_percent INTEGER,
  
  -- Metadane systemowe
  updated_at TEXT DEFAULT (datetime('now'))
);

-- 2. Tabela Sesji Klienta (Do scoringu AI - "Mózg")
CREATE TABLE IF NOT EXISTS customer_sessions (
  customer_id TEXT NOT NULL,
  session_id TEXT NOT NULL,
  event_count INTEGER DEFAULT 0,
  first_event_at INTEGER NOT NULL, -- Timestamp
  last_event_at INTEGER NOT NULL,  -- Timestamp
  ai_score REAL DEFAULT 0.0,       -- Ocena klienta 0-100
  ai_analysis TEXT,                -- Komentarz Agenta
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (customer_id, session_id)
);

-- 3. Indeksy dla szybkości (żeby Dashboard nie zamulał)
CREATE INDEX IF NOT EXISTS idx_pixel_events_session ON pixel_events(session_id);
CREATE INDEX IF NOT EXISTS idx_pixel_events_customer ON pixel_events(customer_id);
CREATE INDEX IF NOT EXISTS idx_sessions_updated ON customer_sessions(updated_at DESC);
