export const getAiGatewayUrl = (env: any, provider: string) => 
  `https://gateway.ai.cloudflare.com/v1/${env.CLOUDFLARE_ACCOUNT_ID}/${env.AI_GATEWAY_ID}/${provider}`;

export const MODELS = {
  VISION: '@cf/meta/llama-3.2-11b-vision-instruct',
  LLM_FAST: '@cf/meta/llama-3.1-8b-instruct',
  LLM_SMALL: '@cf/meta/llama-3.2-3b-instruct',
  LLM_TOOL_USE: '@cf/meta/llama-3-1-8b-instruct-tool-use',
  EMBEDDING: '@cf/baai/bge-small-en-v1.5'
};
