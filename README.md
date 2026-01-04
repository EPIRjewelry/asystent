# epir-ai-platform-v2
Refaktoryzowana platforma AI na Cloudflare Workers: mikroserwisy, Gateway, D1, Durable Objects, Vectorize i Workers AI. RAG w podejściu MCP-first (Shopify), multimodalność (Vision), separacja analityki i czatu, brak współdzielonej bazy.
## Architektura (Scenariusz A: Gateway Pattern)
+----------------+ +-------------------------+ +-------------------+
| Shopify Store | ----> | epir-gateway-worker | ----> | epir-customer- |
| (App Proxy/ | | (Routing, Auth, Logger) | | dialogue-worker |
| Web Pixel) | <---- | | <---->| (Session Mgmt, DO)|
+----------------+ +-------------------------+ +-------------------+
| ^
| |
v |
+-------------------------+
| epir-web-pixel-ingestor |
| (Data Ingestion to D1) |
+-------------------------+
|
v
+-------------------------+
| epir-analytics-api-worker |
| (Data Query, Reporting) |
+-------------------------+

epir-customer-dialogue-worker <----> +---------------------+
| epir-brain-service |
| (RAG, LLM, Vision, |
| MCP Interaction) |
+---------------------+


**Role:**
- epir-gateway-worker: brama (routing `/chat`, `/pixel`, `/analytics`, HMAC).
- epir-customer-dialogue-worker: DO + stan sesji (wewnętrzny SQLite), archiwizacja do D1, woła brain-service.
- epir-brain-service: MCP-first RAG, Vectorize, Workers AI (LLM + Vision).
- epir-web-pixel-ingestor: szybki zapis zdarzeń do D1.
- epir-analytics-api-worker: odczyt/analityka z D1.
## Technologie
Cloudflare Workers, D1, Durable Objects (z wewnętrznym SQLite), Vectorize, Workers AI (Llama 3.2 Vision), Shopify App Proxy.
## Skrót setupu
- `wrangler d1 create …` dla: epir-web-pixel-events-db, epir-rag-cache-db, ai-assistant-sessions-db.
- Uzupełnij ID baz w wrangler.toml.
- `wrangler deploy` w każdym serwisie.
