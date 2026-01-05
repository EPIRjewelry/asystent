import { verifyShopifyHmac } from './utils/shopify'; // do zaimplementowania

export interface Env {
  SHOP_DOMAIN: string;
  SHOPIFY_API_SECRET: string;
  CLOUDFLARE_ACCOUNT_ID: string;
  AI_GATEWAY_ID: string;

  CUSTOMER_DIALOGUE_SERVICE: Fetcher;
  WEB_PIXEL_INGESTOR_SERVICE: Fetcher;
  ANALYTICS_API_SERVICE: Fetcher;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // Weryfikacja HMAC dla wszystkich zapytań do API
    if (url.pathname.startsWith('/api/')) {
        if (!await verifyShopifyHmac(request, env.SHOPIFY_API_SECRET)) {
            return new Response('Unauthorized', { status: 401 });
        }
    }

    if (url.pathname.startsWith('/api/chat')) {
      return env.CUSTOMER_DIALOGUE_SERVICE.fetch(request.clone());
    }

    if (url.pathname.startsWith('/api/pixel')) {
      return env.WEB_PIXEL_INGESTOR_SERVICE.fetch(request.clone());
    }

    if (url.pathname.startsWith('/api/analytics')) {
      return env.ANALYTICS_API_SERVICE.fetch(request.clone());
    }

    return new Response('Epir AI Gateway', { status: 200 });
  },
};
