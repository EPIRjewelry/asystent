import { ChatSessionDO } from './do/ChatSession';

export interface Env {
  CHAT_SESSION_DO: DurableObjectNamespace;
  AI_ASSISTANT_SESSIONS_DB: D1Database;
  BRAIN_SERVICE: Fetcher;
}

export { ChatSessionDO };

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const sessionId = url.searchParams.get('sessionId') || crypto.randomUUID(); // Użyj UUID
    const id = env.CHAT_SESSION_DO.idFromName(sessionId);
    const stub = env.CHAT_SESSION_DO.get(id);

    // Proxy request do DO
    if (url.pathname.startsWith('/api/chat/send') || url.pathname.startsWith('/api/chat/history')) {
      return stub.fetch(request.clone());
    }

    return new Response(JSON.stringify({ ok: true, sessionId }), { headers: { 'Content-Type': 'application/json' } });
  },
};
