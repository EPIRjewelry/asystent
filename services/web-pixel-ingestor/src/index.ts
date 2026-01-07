interface Env {
  WEB_PIXEL_EVENTS_DB: D1Database; // W V2 Twoja baza nazywa się tak
  SESSION_DO?: DurableObjectNamespace; // Opcjonalnie - jeśli będziesz chciał podpiąć DO w przyszłości
  AI_WORKER?: Fetcher; // Opcjonalnie - do analizy AI
  
  // Sekrety Google Cloud (BigQuery)
  GOOGLE_CLIENT_EMAIL: string;
  GOOGLE_PRIVATE_KEY: string;
  GOOGLE_PROJECT_ID: string;
}

// --- SEKCJA 1: INTEGRACJA Z BIGQUERY (Z V2) ---

const base64UrlEncode = (str: string) => {
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

function str2ab(str:string) {
    const pemHeader = "-----BEGIN PRIVATE KEY-----";
    const pemFooter = "-----END PRIVATE KEY-----";
    const pemContents = str.substring(pemHeader.length, str.length - pemFooter.length).replace(/\s/g, '');
    const binaryDerString = atob(pemContents);
    const binaryDer = new Uint8Array(binaryDerString.length);
    for (let i = 0; i < binaryDerString.length; i++) {
        binaryDer[i] = binaryDerString.charCodeAt(i);
    }
    return binaryDer.buffer;
}

async function getGoogleAuthToken(env: Env): Promise<string | null> {
  try {
    const pem = env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n');
    const header = { alg: 'RS256', typ: 'JWT' };
    const now = Math.floor(Date.now() / 1000);
    const oneHour = 3600;
    const claim = {
      iss: env.GOOGLE_CLIENT_EMAIL,
      scope: 'https://www.googleapis.com/auth/bigquery.insertdata',
      aud: 'https://oauth2.googleapis.com/token',
      exp: now + oneHour,
      iat: now,
    };
    const encodedHeader = base64UrlEncode(JSON.stringify(header));
    const encodedClaim = base64UrlEncode(JSON.stringify(claim));
    const signatureInput = `${encodedHeader}.${encodedClaim}`;
    const key = await crypto.subtle.importKey(
      'pkcs8', str2ab(pem), { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']
    );
    const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(signatureInput));
    const encodedSignature = base64UrlEncode(String.fromCharCode(...new Uint8Array(signature)));
    const jwt = `${signatureInput}.${encodedSignature}`;
    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: jwt }),
    });
    const tokenData: any = await tokenResponse.json();
    return tokenData.access_token;
  } catch (e) {
    console.error('Error getting Google Token:', e);
    return null;
  }
}

async function streamToBigQuery(event: any, env: Env) {
  const datasetId = 'analytics_435783047';
  const tableId = 'events_raw';
  const token = await getGoogleAuthToken(env);
  if (!token) return;

  const url = `https://bigquery.googleapis.com/bigquery/v2/projects/${env.GOOGLE_PROJECT_ID}/datasets/${datasetId}/tables/${tableId}/insertAll`;
  
  // BigQuery wymaga payloadu jako string JSON w kolumnie 'payload' (według schematu który utworzyliśmy wcześniej)
  // Możemy też wysłać znormalizowane pola jeśli tabela na to pozwala, ale tutaj trzymy się bezpiecznego 'payload'
  const row = {
    json: {
      event_type: event.event_type,
      session_id: event.session_id,
      customer_id: event.customer_id,
      url: event.page_url || event.url,
      payload: JSON.stringify(event), // Pełny bogaty obiekt z V1
      created_at: new Date().toISOString()
    }
  };

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ kind: "bigquery#tableDataInsertAllRequest", rows: [row] })
  });

  if (!response.ok) console.error(`BigQuery Insert Error: ${await response.text()}`);
}

// --- SEKCJA 2: LOGIKA BIZNESOWA (Z V1) ---

async function insertFullPixelEvent(env: Env, body: any, timestamp: number) {
    const db = env.WEB_PIXEL_EVENTS_DB;
    const eventType = body.type;
    const eventData = body.data || {};
    const createdAtIso = new Date(timestamp).toISOString();
    
    // 1. Ekstrakcja danych (Logika V1 - Full Spectrum)
    let customerId = eventData.customerId ? String(eventData.customerId) : 'anonymous';
    let sessionId = eventData.sessionId ? String(eventData.sessionId) : `session_${timestamp}_${Math.random().toString(36).slice(2, 8)}`;
    let pageUrl = eventData.url || eventData.context?.document?.location?.href || null;
    let productId = null;
    let productTitle = null;
    let cartTotal = null;

    // Próba wydobycia danych o produkcie (uproszczona logika V1)
    if (eventData.productVariant?.product) {
        productId = String(eventData.productVariant.product.id || '');
        productTitle = String(eventData.productVariant.product.title || '');
    }
    if (eventData.cart?.cost?.totalAmount?.amount) {
        cartTotal = eventData.cart.cost.totalAmount.amount;
    }

    // Heatmapy i inne pola specyficzne
    let clickX = eventData.x || null;
    let clickY = eventData.y || null;
    let scrollDepth = eventData.depth || eventData.max_scroll_percent || null;

    const eventId = crypto.randomUUID();
    const rawData = JSON.stringify({ event: eventType, data: eventData, timestamp });

    // 2. Zapis do D1 (Tabela pixel_events - Rich Schema)
    // Używamy try-catch, żeby błąd D1 nie zatrzymał wysyłki do BigQuery
    try {
        await db.prepare(
          `INSERT INTO pixel_events (
            id, event_type, created_at, customer_id, session_id,
            page_url, product_id, product_title, cart_total,
            raw_data, click_x, click_y, scroll_depth_percent
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        ).bind(
          eventId, eventType, createdAtIso, customerId, sessionId,
          pageUrl, productId, productTitle, cartTotal,
          rawData, clickX, clickY, scrollDepth
        ).run();
    } catch (e) {
        console.error('D1 Insert Error:', e);
    }

    // 3. Zapis do Customer Sessions (Scoring)
    try {
        // Upsert sesji
        await db.prepare(`
            INSERT INTO customer_sessions (customer_id, session_id, first_event_at, last_event_at, created_at, updated_at, event_count)
            VALUES (?1, ?2, ?3, ?3, ?3, ?3, 1)
            ON CONFLICT(customer_id, session_id) DO UPDATE SET
            last_event_at = ?3,
            updated_at = ?3,
            event_count = event_count + 1
        `).bind(customerId, sessionId, timestamp).run();
    } catch (e) { console.error('Session Update Error:', e); }

    // Zwracamy obiekt wzbogacony o ID sesji i klienta dla BigQuery
    return {
        ...body,
        customer_id: customerId,
        session_id: sessionId,
        page_url: pageUrl,
        event_id: eventId
    };
}

// --- SEKCJA 3: GŁÓWNY HANDLER ---

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    // Obsługa CORS (dla Pixela)
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    if (request.method === 'POST' && (url.pathname === '/pixel' || url.pathname.startsWith('/ingest'))) {
      try {
        const body = await request.json<any>();
        const timestamp = Date.now();

        // 1. Zapis do D1 (Logika V1)
        const enrichedEvent = await insertFullPixelEvent(env, body, timestamp);

        // 2. Wysyłka do BigQuery (Logika V2 - Asynchroniczna)
        ctx.waitUntil(streamToBigQuery(enrichedEvent, env));

        // 3. (Opcjonalnie) Powiadomienie SessionDO - jeśli skonfigurowane
        // Tu byłby kod wywołujący Durable Object, jeśli go dodasz do wrangler.toml

        return new Response(JSON.stringify({ ok: true, session_id: enrichedEvent.session_id }), {
            headers: { 'Content-Type': 'application/json', ...corsHeaders }
        });
      } catch (e: any) {
        console.error('Worker Error:', e);
        return new Response(JSON.stringify({ ok: false, error: e.message }), { status: 500, headers: corsHeaders });
      }
    }

    return new Response('Hybrid Analytics Worker Active', { status: 200 });
  },
};