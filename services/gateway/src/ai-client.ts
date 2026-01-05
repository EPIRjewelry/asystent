import { getAiGatewayUrl } from './model-params';

export interface AiMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
}

export interface AiPayload {
  messages: AiMessage[];
  stream?: boolean;
  max_tokens?: number;
  temperature?: number;
}

export async function getGroqResponse(env: any, payload: AiPayload) {
  const gatewayUrl = getAiGatewayUrl(env, 'groq') + '/openai/v1/chat/completions';
  
  const response = await fetch(gatewayUrl, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${env.GROQ_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: 'llama-3.1-70b-versatile', // Domyślny model Groq
      ...payload
    })
  });

  return response;
}

export async function runCloudflareAi(env: any, model: string, payload: AiPayload) {
  // Upewniamy się, że używamy formatu messages zgodnie z wytycznymi
  const response = await env.AI.run(model, {
    messages: payload.messages,
    stream: payload.stream || false,
    max_tokens: payload.max_tokens,
    temperature: payload.temperature
  });

  return response;
}

export async function streamAiResponse(env: any, model: string, payload: AiPayload) {
  if (model.startsWith('@cf/')) {
    return await runCloudflareAi(env, model, { ...payload, stream: true });
  } else {
    // Dla Groq przez AI Gateway
    const response = await getGroqResponse(env, { ...payload, stream: true });
    return response.body;
  }
}
