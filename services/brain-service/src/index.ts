import { availableTools, executeTool, ToolResult } from './tools';

export interface Env {
  AI: any; // Cloudflare Workers AI binding
  RAG_VECTOR_INDEX: any; // Vectorize binding
  RAG_CACHE_DB: D1Database;
  ANALYTICS_API_SERVICE: Fetcher;
  MCP_API_ENDPOINT: string;
  MCP_API_KEY: string;
}

interface ProcessRequest {
  query?: string;
  image_data_base64?: string;
  session_id?: string; // Opcjonalne do logowania/debugowania
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === '/process' && request.method === 'POST') {
      const { query, image_data_base64, session_id } = await request.json<ProcessRequest>();

      if (!query && !image_data_base64) {
        return json({ error: 'Missing query or image_data_base64' }, 400);
      }

      // 1. Sprawdź cache D1 dla szybkiej odpowiedzi (tylko dla zapytań tekstowych)
      if (query && !image_data_base64) {
        const cached = await env.RAG_CACHE_DB.prepare('SELECT response FROM rag_cache WHERE query = ?')
          .bind(query)
          .first<{ response: string }>();
        if (cached?.response) {
          return json({ answer: cached.response, source: 'cache' });
        }
      }

      let visualAnalysis = '';
      // 2. Multimodalna analiza obrazu (Llama 3.2 Vision)
      if (image_data_base64) {
        try {
          const imageResult = await env.AI.run(
            '@cf/meta/llama-3.2-11b-vision-instruct',
            {
              prompt: 'Opisz styl, materiał i kamienie w tej biżuterii. Zwróć krótki opis tekstowy, bez JSONa, aby wzbogacić prompt LLM.',
              image: [image_data_base64], // Przekazanie danych obrazu
            }
          );
          visualAnalysis = `\nKONTEKST WIZUALNY: ${imageResult.response}`;
          console.log(`[Brain Service] Visual analysis for session ${session_id}: ${visualAnalysis}`);
        } catch (visionError) {
          console.error(`[Brain Service] Llama Vision error for session ${session_id}:`, visionError);
          visualAnalysis = '\nKONTEKST WIZUALNY: Nie udało się przeanalizować obrazu.';
        }
      }

      // 3. Generuj embedding dla zapytania (tekst + ewentualna analiza wizualna)
      const embeddingText = `${query || ''} ${visualAnalysis}`;
      const embeddingResponse = await env.AI.run('@cf/baai/bge-small-en-v1.5', { text: embeddingText });
      const embedding = embeddingResponse.data[0];

      // 4. Wyszukaj w Vectorize
      const searchResults = await env.RAG_VECTOR_INDEX.query(embedding, { topK: 5 });
      const contextFromVectorize = searchResults.matches?.map((m: any) => m.metadata?.text).join('\n') || '';

      // 5. Interakcja z MCP (priorytet)
      let mcpAnswer = null;
      try {
        const mcpQuery = `${query}${visualAnalysis}`; // Przekaż pełny kontekst do MCP
        const mcpResponse = await fetch(`${env.MCP_API_ENDPOINT}/query`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${env.MCP_API_KEY}`
          },
          body: JSON.stringify({ query: mcpQuery, context: contextFromVectorize, session_id })
        });

        if (mcpResponse.ok) {
          const mcpData = await mcpResponse.json();
          mcpAnswer = mcpData.answer;
          console.log(`[Brain Service] Response from MCP for session ${session_id}.`);
        } else {
          console.error(`[Brain Service] MCP returned error for session ${session_id}: ${mcpResponse.status}`);
        }
      } catch (error) {
        console.error(`[Brain Service] Error contacting MCP for session ${session_id}:`, error);
        // Kontynuuj z LLM, jeśli MCP zawiedzie
      }

      // 6. Użyj LLM z Workers AI (zintegrowany kontekst)
      const systemPrompt = `Jesteś wysoce wyspecjalizowanym ekspertem jubilerskim EPIR, artystą, filozofem i inżynierem AI. Twoim zadaniem jest doradzać klientom w zakresie ręcznie wykonanej biżuterii, odlewów z wosku traconego i projektowania 3D w Blenderze. Musisz doskonale rozumieć temat, umieć składać komplety z elementów, dobierać biżuterię do koszyka i proponować tworzenie biżuterii na zamówienie.
        Odpowiedz na podstawie poniższego kontekstu, priorytetyzując dane z MCP, następnie Vectorize. Nie zmyślaj cen ani dostępności.
        ${contextFromVectorize ? `KONTEKST DODATKOWY (z Vectorize):\n${contextFromVectorize}` : ''}
        ${mcpAnswer ? `DANE Z MCP (Shopify):\n${mcpAnswer}` : ''}`;

      const userMessageContent = `${query}${visualAnalysis}`;
      const aiResponse = await env.AI.run('@cf/mistral/mistral-7b-instruct-v0.1', { // Llama 3.2 8B/70B Instruct może być lepsze
        messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: userMessageContent }]
      });

      const answer = aiResponse.response || 'Nie mogłem znaleźć odpowiedzi.';

      // Zapisz do cache D1 (tylko dla zapytań bez obrazu, by uniknąć złożonych kluczy cache)
      if (query && !image_data_base64) {
        await env.RAG_CACHE_DB.prepare('INSERT INTO rag_cache (query, response) VALUES (?, ?) ON CONFLICT(query) DO UPDATE SET response=excluded.response')
          .bind(query, answer)
          .run();
      }

      return json({ answer, source: mcpAnswer ? 'mcp+llm' : 'llm', contextUsed: !!(contextFromVectorize || mcpAnswer), visualAnalysis: visualAnalysis });
    }

    return new Response('Brain Service is running!', { status: 200 });
  },
};

function json(obj: any, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json' } });
}
