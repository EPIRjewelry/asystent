import { availableTools, executeTool, ToolResult } from './tools';
import { runCloudflareAi, streamAiResponse, AiPayload } from './ai-client';
import { MODELS } from './model-params';

export interface Env {
  AI: any; // Cloudflare Workers AI binding
  RAG_VECTOR_INDEX: any; // Vectorize binding
  RAG_CACHE_DB: D1Database;
  ANALYTICS_API_SERVICE: Fetcher;
  MCP_API_ENDPOINT: string;
  MCP_API_KEY: string;
  SHOPIFY_ADMIN_TOKEN?: string; // Opcjonalny, do dostępu do Shopify Admin API
  SHOPIFY_DOMAIN: string; // Domena sklepu Shopify, np. "epir-jewelry-development.myshopify.com"
  CLOUDFLARE_ACCOUNT_ID: string;
  AI_GATEWAY_ID: string;
  GROQ_API_KEY?: string;
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
          const visionPayload: AiPayload = {
            messages: [
              { role: 'system', content: 'Jesteś ekspertem jubilerskim analizującym zdjęcia biżuterii.' },
              { role: 'user', content: 'Opisz styl, materiał i kamienie w tej biżuterii. Zwróć krótki opis tekstowy, bez JSONa, aby wzbogacić prompt LLM.' }
            ]
          };
          
          // Dla vision modelu używamy specyficznego formatu jeśli env.AI.run go wymaga, 
          // ale tutaj trzymamy się wytycznych o messages jeśli to możliwe.
          // Uwaga: Niektóre modele vision wymagają 'image' w parametrach obok 'messages' lub wewnątrz 'messages'.
          const imageResult = await env.AI.run(MODELS.VISION, {
            ...visionPayload,
            image: [image_data_base64]
          });
          
          visualAnalysis = `\nKONTEKST WIZUALNY: ${imageResult.response}`;
          console.log(`[Brain Service] Visual analysis for session ${session_id}: ${visualAnalysis}`);
        } catch (visionError) {
          console.error(`[Brain Service] Llama Vision error for session ${session_id}:`, visionError);
          visualAnalysis = '\nKONTEKST WIZUALNY: Nie udało się przeanalizować obrazu.';
        }
      }

      // 3. Generuj embedding dla zapytania (tekst + ewentualna analiza wizualna)
      const embeddingText = `${query || ''} ${visualAnalysis}`;
      const embeddingResponse = await env.AI.run(MODELS.EMBEDDING, { text: embeddingText });
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
        Odpowiedz na podstawie poniższego kontekstu, priorytetyzując dane z MCP, następnie Vectorize, a także wykorzystując dostępne narzędzia, takie jak pobieranie informacji o produktach Shopify. Nie zmyślaj cen ani dostępności.
        ${contextFromVectorize ? `KONTEKST DODATKOWY (z Vectorize):\n${contextFromVectorize}` : ''}
        ${mcpAnswer ? `DANE Z MCP (Shopify):\n${mcpAnswer}` : ''}`;

      const userMessageContent = `${query}${visualAnalysis}`;
      const messages: any[] = [{ role: 'system', content: systemPrompt }, { role: 'user', content: userMessageContent }];

      // Używamy runCloudflareAi z ai-client.ts
      const aiResponse = await runCloudflareAi(env, MODELS.LLM_TOOL_USE, {
        messages,
        // @ts-ignore - tools are supported by this model
        tools: Object.values(availableTools)
      });

      // Sprawdź, czy model chce wywołać narzędzie
      if (aiResponse.tool_calls && aiResponse.tool_calls.length > 0) {
        console.log(`[Brain Service] Session ${session_id} initiated tool calls.`);
        const toolCall = aiResponse.tool_calls[0]; // Na razie obsłużmy jedno wywołanie
        
        const toolResult = await executeTool(toolCall.name, toolCall.arguments, env);
        
        // Dodaj wynik działania narzędzia do historii i ponownie wywołaj LLM
        messages.push({ role: 'assistant', content: JSON.stringify(aiResponse) });
        messages.push({ role: 'tool', content: JSON.stringify(toolResult) });

        const finalAiResponse = await runCloudflareAi(env, MODELS.LLM_TOOL_USE, { messages });

        const answer = finalAiResponse.response || 'Nie mogłem znaleźć odpowiedzi po użyciu narzędzia.';
        return json({ answer, source: 'llm+tool', toolUsed: toolCall.name });

      } else {
        // Standardowa odpowiedź bez narzędzi
        const answer = aiResponse.response || 'Nie mogłem znaleźć odpowiedzi.';
        
        // Zapisz do cache D1
        if (query && !image_data_base64) {
          await env.RAG_CACHE_DB.prepare('INSERT INTO rag_cache (query, response) VALUES (?, ?) ON CONFLICT(query) DO UPDATE SET response=excluded.response')
            .bind(query, answer)
            .run();
        }

        return json({ answer, source: mcpAnswer ? 'mcp+llm' : 'llm', contextUsed: !!(contextFromVectorize || mcpAnswer), visualAnalysis: visualAnalysis });
      }
    }

    return new Response('Brain Service is running!', { status: 200 });
  },
};

function json(obj: any, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json' } });
}
