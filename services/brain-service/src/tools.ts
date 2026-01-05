import type { Env } from './index';

// Definicja zgodna z oczekiwaniami MCP dla narzędzi, które może wywołać AI
export interface ToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, any>; // JSON Schema
}

// Interfejs dla wyniku wywołania narzędzia
export interface ToolResult {
  tool_name: string;
  output: any;
}

// Konkretna implementacja narzędzia
export const getCustomerContextTool: ToolDefinition = {
  name: 'get_customer_context',
  description: 'Pobiera ostatnie zdarzenia (aktywność) klienta ze sklepu, takie jak oglądane produkty. Użyj tego, aby zrozumieć, co klient ostatnio robił.',
  parameters: {
    type: 'object',
    properties: {
      session_id: {
        type: 'string',
        description: 'ID sesji klienta, dla której pobrać kontekst.'
      },
      limit: {
        type: 'number',
        description: 'Liczba ostatnich zdarzeń do pobrania.',
        default: 10
      }
    },
    required: ['session_id']
  }
};

export const getProductInfoTool: ToolDefinition = {
  name: 'get_product_info',
  description: 'Pobiera szczegółowe informacje o produkcie ze sklepu Shopify na podstawie jego handle (slug) lub ID. Użyj tego, aby uzyskać opis, cenę, dostępność itp. biżuterii.',
  parameters: {
    type: 'object',
    properties: {
      handle: {
        type: 'string',
        description: 'Handle produktu (slug), np. \"naszyjnik-perlowy\".'
      },
      id: {
        type: 'string',
        description: 'Global ID produktu Shopify, np. \"gid://shopify/Product/1234567890\".'
      }
    },
    oneOf: [{ required: ['handle'] }, { required: ['id'] }]
  }
};

// Rejestr dostępnych narzędzi
export const availableTools: Record<string, ToolDefinition> = {
  [getCustomerContextTool.name]: getCustomerContextTool,
  [getProductInfoTool.name]: getProductInfoTool,
};

// Funkcja, która faktycznie wykonuje logikę narzędzia
export async function executeTool(toolName: string, args: any, env: any): Promise<ToolResult> {
  switch (toolName) {
    case 'get_customer_context':
      try {
        const { session_id, limit = 10 } = args;
        const analyticsUrl = `https://analytics-api/analytics/events?limit=${limit}&sessionId=${session_id}`;
        
        // Wywołanie serwisu analitycznego w celu pobrania danych
        // UWAGA: To wymaga dodania service binding do `analytics-api` w `wrangler.toml` dla `brain-service`
        const response = await env.ANALYTICS_API_SERVICE.fetch(new Request(analyticsUrl));
        
        if (!response.ok) {
          throw new Error(`Analytics API returned status ${response.status}`);
        }
        
        const events = await response.json();
        
        return {
          tool_name: toolName,
          output: { success: true, events: events }
        };

      } catch (error: any) {
        return {
          tool_name: toolName,
          output: { success: false, error: error.message }
        };
      }
    case 'get_product_info':
      try {
        const result = await callShopifyMcp(toolName, args, env);
        return {
          tool_name: toolName,
          output: { success: true, product: result }
        };
      } catch (error: any) {
        return {
          tool_name: toolName,
          output: { success: false, error: error.message }
        };
      }
    default:
      throw new Error(`Tool "${toolName}" not found.`);
  }
}


async function callShopifyMcp(toolName: string, args: Record<string, any>, env: Env): Promise<any> {
  // Budujemy URL do naszego Gatewaya, który następnie będzie proxy'ował do Shopify MCP
  // Gateway musi być skonfigurowany z App Proxy i przekierowywać /apps/chat/api/mcp do Shopify
  const mcpGatewayUrl = `${env.MCP_API_ENDPOINT}/apps/chat/api/mcp`; // MCP_API_ENDPOINT już zawiera adres naszego Gatewaya App Proxy

  console.log(`[callShopifyMcp] Calling tool '${toolName}' via Gateway MCP Proxy: ${mcpGatewayUrl}`);

  try {
    const response = await fetch(mcpGatewayUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // Shopify App Proxy automatycznie doda potrzebne nagłówki (HMAC, Shop Domain)
        // do zapytania do Shopify MCP. Nasz Brain-Service nie wysyła bezpośrednio tokenów Shopify.
        // Jeśli MCP_API_ENDPOINT ma własne uwierzytelnianie, dodaj tutaj.
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'tools/call', // Standardowa metoda JSON-RPC dla wywoływania narzędzi
        id: 1, // Identyfikator żądania
        params: {
          name: toolName,
          arguments: args,
        },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[callShopifyMcp] Shopify MCP Tool Call Error (${toolName}): ${response.status} - ${errorText}`);
      throw new Error(`Shopify MCP Tool Call Failed: ${response.status} - ${errorText}`);
    }

    const jsonRpcResponse = await response.json();

    if (jsonRpcResponse.error) {
      console.error(`[callShopifyMcp] Shopify MCP JSON-RPC Error (${toolName}):`, jsonRpcResponse.error);
      throw new Error(`Shopify MCP JSON-RPC Error: ${jsonRpcResponse.error.message || 'Unknown error'}`);
    }

    return jsonRpcResponse.result; // Zwracamy wynik narzędzia
  } catch (error) {
    console.error(`[callShopifyMcp] Critical error during Shopify MCP tool call (${toolName}):`, error);
    throw error;
  }
}
