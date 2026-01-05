import { register } from "@shopify/web-pixels-extension";

register(({ analytics, browser, init, settings }) => {
  const GATEWAY_ENDPOINT = '/apps/chat/api/pixel/ingest'; // Endpoint Gatewaya przez App Proxy

  // Funkcja do pobierania sessionId (z localStorage, lub generowanie nowego)
  const getSessionId = (): string => {
    let sessionId = localStorage.getItem('epir_session_id');
    if (!sessionId) {
      sessionId = crypto.randomUUID();
      localStorage.setItem('epir_session_id', sessionId);
    }
    return sessionId;
  };

  const sessionId = getSessionId();

  // Lista wszystkich 26 eventów do subskrypcji (zgodnie z naszymi ustaleniami)
  const eventsToSubscribe = [
    'page_viewed', 'product_viewed', 'collection_viewed', 'search_submitted',
    'product_added_to_cart', 'product_removed_from_cart', 'cart_viewed', 'cart_updated',
    'checkout_started', 'checkout_contact_info_submitted', 'checkout_address_info_submitted',
    'checkout_shipping_info_submitted', 'payment_info_submitted', 'checkout_completed',
    'purchase_completed', 'alert_displayed', // 16 Standardowych Shopify

    // 5 DOM Events (zakładamy, że są publikowane przez Theme App Extension)
    'clicked', 'input_focused', 'input_blurred', 'input_changed', 'form_submitted',

    // 4 Custom Heatmap Events (publikowane przez Theme App Extension)
    'epir:click_with_position', 'epir:scroll_depth', 'epir:page_exit', 'epir:mouse_sample',

    // Dodatkowy event błędu UI (jeśli występuje w extensions)
    'ui_extension_errored'
  ];

  // Subskrybuj wszystkie zdefiniowane eventy
  eventsToSubscribe.forEach(eventName => {
    analytics.subscribe(eventName as any, async (event) => { // 'as any' workaround for custom events
      console.log(`[Web Pixel] Event subscribed: ${eventName}`, event);

      try {
        const browserContext = {
          userAgent: browser.userAgent,
          screenWidth: browser.viewport.width,
          screenHeight: browser.viewport.height,
          language: browser.language,
          referrer: browser.referrer,
          url: browser.location.href, // Duplikujemy dla łatwiejszej analizy w D1
          // Możesz dodać inne dane z 'browser' jeśli są potrzebne
        };

        const payload = {
          event_type: eventName,
          customer_id: init.customerId, // init.customerId jest prawidłowym źródłem ID klienta
          session_id: sessionId,
          url: browser.location.href,
          payload: event, // Cały obiekt eventu jako payload
          browser_context: browserContext,
          timestamp: Date.now(), // Dodajemy timestamp na frontendzie dla precyzji
        };

        await fetch(GATEWAY_ENDPOINT, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
        });
        console.log(`[Web Pixel] Event ${eventName} sent to Gateway.`);
      } catch (error) {
        console.error(`[Web Pixel] Error sending event ${eventName} to Gateway:`, error);
      }
    });
  });

  // UWAGA: DOM events i custom heatmap events muszą być publikowane przez Theme App Extension
  // używając Shopify.analytics.publish() w assistant.js lub tracking.js,
  // aby Web Pixel mógł je subskrybować. To jest KRYTYCZNY krok do wykonania w TAE.
});