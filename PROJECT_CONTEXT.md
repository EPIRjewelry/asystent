# Kontekst Projektu: EPIR AI Platform v2

Ten dokument podsumowuje stan projektu na dzień 4 stycznia 2026 roku i określa kierunki dalszych prac.

## Cel Projektu

Zbudowanie i wdrożenie zaawansowanej platformy AI dla sklepu EPIRjewelry na Shopify. Architektura oparta jest na mikroserwisach hostowanych na Cloudflare, z głęboką integracją z ekosystemem Shopify.

## Obecny Stan Implementacji

Zakończono implementację i wdrożenie kluczowych komponentów platformy.

### 1. Backend (Cloudflare Workers)

- **Architektura**: W pełni wdrożona architektura mikroserwisowa.
- **Serwisy**:
    - `gateway`: Pełni rolę bramy API, zabezpieczony weryfikacją HMAC Shopify.
    - `customer-dialogue`: Zarządza sesjami czatu za pomocą Durable Objects + SQLite.
    - `brain-service`: Centralna jednostka AI, obsługuje RAG, Vision i jest przygotowana do używania narzędzi (tool use).
    - `web-pixel-ingestor`: Asynchronicznie i wydajnie zbiera dane analityczne.
    - `analytics-api`: Udostępnia zebrane dane do analizy.

### 2. Warstwa Danych

- Zaimplementowano zaawansowaną strategię danych:
    - **DO + SQLite**: Używane jako "gorąca pamięć" dla aktywnego kontekstu LLM.
    - **D1**: Trzy oddzielne bazy danych dla analityki, archiwum sesji i cache'u RAG.
    - **Vectorize**: Przechowuje embeddingi i ID, z pełnym tekstem w D1 dla optymalizacji.

### 3. Frontend (Shopify Extensions)

- **Theme App Extension**: Stworzono interfejs czatu (`asystent-klienta`), który komunikuje się z backendem przez App Proxy.
- **Web Pixel Extension**: Skonfigurowano zbieranie standardowych zdarzeń Shopify i wysyłanie ich do `web-pixel-ingestor`.

### 4. Automatyzacja

- Stworzono skrypt `tools/deploy-all.ps1` do zautomatyzowanego wdrażania całej platformy.

## Następne Kroki

Gdy wznowimy pracę, skupimy się na następujących zadaniach:

1.  **Pełne uruchomienie Narzędzi AI**: Rozbudowa `brain-service` o pętlę wywoływania narzędzi i przekazywania wyników do LLM.
2.  **Budowa Serwera MCP**: Stworzenie dedykowanego serwera (np. jako Cloudflare Worker), który będzie dostarczał `brain-service` kontekstu z Shopify Admin API (np. informacje o produktach, zamówieniach).
3.  **Testy End-to-End**: Przeprowadzenie pełnych testów integracyjnych w środowisku deweloperskim Shopify, aby zweryfikować przepływ danych od interfejsu w sklepie, przez backend, aż po odpowiedź AI.
