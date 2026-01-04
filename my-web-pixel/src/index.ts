import { register } from '@shopify/web-pixels-extension';

register(({ analytics, browser, settings, init }) => {
  const endpoint = '/apps/chat/api/pixel/ingest';

  function createPayload(event) {
    return {
      event_type: event.name,
      customer_id: event.data.customer?.id,
      session_id: init.visitorId,
      url: browser.location.href,
      payload: {
        ...event,
        browser_context: {
          userAgent: browser.userAgent,
          language: browser.language,
        },
      },
    };
  }

  async function sendEvent(event) {
    const payload = createPayload(event);
    try {
      await browser.sendBeacon(endpoint, JSON.stringify(payload));
    } catch (error) {
      console.error('Failed to send web pixel event:', error);
    }
  }

  // Standardowe zdarzenia
  analytics.subscribe('cart_updated', sendEvent);
  analytics.subscribe('checkout_completed', sendEvent);
  analytics.subscribe('checkout_started', sendEvent);
  analytics.subscribe('collection_viewed', sendEvent);
  analytics.subscribe('page_viewed', sendEvent);
  analytics.subscribe('product_added_to_cart', sendEvent);
  analytics.subscribe('product_viewed', sendEvent);
  analytics.subscribe('search_submitted', sendEvent);

  // Zdarzenia niestandardowe
  analytics.subscribe('custom_event_name', sendEvent); // Przykładowe zdarzenie niestandardowe
});
