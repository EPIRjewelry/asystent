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

// Rejestr dostępnych narzędzi
export const availableTools: Record<string, ToolDefinition> = {
  [getCustomerContextTool.name]: getCustomerContextTool
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
    default:
      throw new Error(`Tool "${toolName}" not found.`);
  }
}
