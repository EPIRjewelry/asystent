export interface Env {
  WEB_PIXEL_EVENTS_DB: D1Database;
  CLOUDFLARE_ACCOUNT_ID: string;
  AI_GATEWAY_ID: string;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // Endpoint do pobierania surowych zdarzeń
    if (url.pathname === '/analytics/events') {
      const limit = parseInt(url.searchParams.get('limit') || '100', 10);
      const eventType = url.searchParams.get('eventType');
      let query = 'SELECT id, event_type, customer_id, session_id, url, created_at, payload FROM pixel_events';
      const params: any[] = [];
      if (eventType) {
        query += ' WHERE event_type = ?';
        params.push(eventType);
      }
      query += ' ORDER BY created_at DESC LIMIT ?'; // Zmieniono na created_at
      params.push(limit);

      const { results } = await env.WEB_PIXEL_EVENTS_DB.prepare(query).bind(...params).all();
      return json(results);
    }

    // Endpoint do podsumowania typów zdarzeń
    if (url.pathname === '/analytics/summary') {
      const { results } = await env.WEB_PIXEL_EVENTS_DB.prepare(
        'SELECT event_type, COUNT(*) as count FROM pixel_events GROUP BY event_type ORDER BY count DESC'
      ).all();
      return json(results);
    }
    
    // Endpoint do analizy produktów oglądanych przez klientów, którzy nie kupują
    if (url.pathname === '/analytics/product-views-no-purchase') {
        const { results } = await env.WEB_PIXEL_EVENTS_DB.prepare(`
          SELECT
            json_extract(payload, '$.productVariant.product.title') as product_title,
            COUNT(*) as view_count
          FROM pixel_events
          WHERE event_type = 'product_viewed'
            AND session_id NOT IN (
                SELECT session_id FROM pixel_events WHERE event_type = 'checkout_completed'
            )
          GROUP BY product_title
          ORDER BY view_count DESC
          LIMIT 10;
        `).all();
        return json(results);
    }

    // Endpoint do analizy wpływu chatbota na konwersję (wymaga zdarzenia 'chat_opened')
    if (url.pathname === '/analytics/chat-conversion') {
        const { results } = await env.WEB_PIXEL_EVENTS_DB.prepare(`
            SELECT
                has_chat_interaction,
                COUNT(DISTINCT session_id) as total_sessions,
                SUM(CASE WHEN event_type = 'checkout_completed' THEN 1 ELSE 0 END) as purchases,
                (SUM(CASE WHEN event_type = 'checkout_completed' THEN 1.0 ELSE 0.0 END) / COUNT(DISTINCT session_id)) * 100 as conversion_rate
            FROM (
                SELECT
                    session_id,
                    event_type,
                    MAX(CASE WHEN event_type = 'chat_opened' THEN 1 ELSE 0 END) OVER (PARTITION BY session_id) as has_chat_interaction
                FROM pixel_events
            )
            GROUP BY has_chat_interaction;
        `).all();
        return json(results);
    }

    return new Response('Analytics API OK', { status: 200 });
  },
};

function json(obj: any, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json' } });
}
