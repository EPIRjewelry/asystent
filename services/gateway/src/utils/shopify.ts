export async function verifyShopifyHmac(request: Request, apiSecret: string): Promise<boolean> {
  const hmacHeader = request.headers.get('X-Shopify-Hmac-Sha256');
  if (!hmacHeader) {
    return false; // Brak nagłówka HMAC
  }

  try {
    const body = await request.clone().text(); // Klonujemy request, aby móc go później odczytać
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      'raw',
      encoder.encode(apiSecret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );

    const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(body));
    
    // Konwertuj ArrayBuffer na string base64
    const base64Signature = btoa(String.fromCharCode(...new Uint8Array(signature)));

    return base64Signature === hmacHeader;
  } catch (error) {
    console.error('Error verifying Shopify HMAC:', error);
    return false;
  }
}
