export interface Env {
  WEB_PIXEL_EVENTS_DB: D1Database;
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === 'POST' && url.pathname.startsWith('/ingest')) {
      try {
        const evt = await request.json<any>();
        const { event_type = 'unknown', customer_id = null, session_id = null, url: event_url = null, payload = {} } = evt; // Dodano session_id, url

        const promise = env.WEB_PIXEL_EVENTS_DB.prepare(
          'INSERT INTO pixel_events (event_type, customer_id, session_id, url, payload, created_at) VALUES (?, ?, ?, ?, ?, ?)'
        )
          .bind(event_type, customer_id, session_id, event_url, JSON.stringify(payload), new Date().toISOString()) // Użyj ISO string dla DATETIME
          .run();
        
        ctx.waitUntil(promise);

        return new Response(JSON.stringify({ ok: true }), { headers: { 'Content-Type': 'application/json' } });
      } catch (e: any) {
        console.error('Error ingesting pixel event:', e);
        return new Response(JSON.stringify({ ok: false, error: e.message }), { status: 400 });
      }
    }

    return new Response('Pixel Ingestor OK', { status: 200 });
  },
};
