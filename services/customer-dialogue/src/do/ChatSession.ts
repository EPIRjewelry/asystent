// Aby używać ctx.storage.sql, Durable Object musi być skonfigurowany z `new_sqlite_classes` w wrangler.toml
// (co zostało uwzględnione w zaktualizowanym pliku wrangler.toml)
export interface Env {
  AI_ASSISTANT_SESSIONS_DB: D1Database;
  BRAIN_SERVICE: Fetcher;
}

interface Message {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
  image_data_base64?: string; // Opcjonalne pole dla danych obrazu
}

export class ChatSessionDO {
  state: DurableObjectState;
  env: Env;
  sql: SqlStorage; // Wewnętrzny silnik SQLite DO
  sessionId: string;

  constructor(state: DurableObjectState, env: Env) {
    this.state = state;
    this.env = env;
    this.sql = state.storage.sql; // Inicjalizacja wewnętrznego SQLite
    this.sessionId = state.id.toString();

    // Migracja wewnętrznego SQLite DO przy starcie (idempotentna)
    this.state.blockConcurrencyWhile(async () => {
      await this.sql.exec(`
        CREATE TABLE IF NOT EXISTS local_messages (
          id TEXT PRIMARY KEY,
          session_id TEXT NOT NULL,
          role TEXT NOT NULL,
          content TEXT NOT NULL,
          timestamp INTEGER NOT NULL,
          image_data_base64 TEXT,
          synced INTEGER DEFAULT 0
        );
        CREATE INDEX IF NOT EXISTS idx_local_messages_session_synced ON local_messages(session_id, synced);
      `);
    });
  }

  async addMessage(role: Message['role'], content: string, image_data_base64?: string) {
    const messageId = crypto.randomUUID(); // Unikalne ID dla wiadomości
    await this.sql.exec(
      `INSERT INTO local_messages (id, session_id, role, content, timestamp, image_data_base64, synced)
       VALUES (?, ?, ?, ?, ?, ?, 0)`,
      messageId, this.sessionId, role, content, Date.now(), image_data_base64 || null
    );

    // Ustaw alarm na za 10 sekund (batching do D1), jeśli nie jest ustawiony
    if (!(await this.state.storage.getAlarm())) {
      await this.state.storage.setAlarm(Date.now() + 10 * 1000);
    }
  }

  async getMessages(): Promise<Message[]> {
    const results = await this.sql.exec(
      'SELECT role, content, timestamp, image_data_base64 FROM local_messages ORDER BY timestamp ASC'
    ).toArray();
    return results as Message[];
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname.endsWith('/send') && request.method === 'POST') {
      const { role, content, image_data_base64 } = await request.json<{ role: Message['role']; content: string; image_data_base64?: string }>();
      await this.addMessage(role, content, image_data_base64);

      // Przykładowe wywołanie Brain Service (do rozbudowania)
      if (role === 'user') {
        const brainResponse = await this.env.BRAIN_SERVICE.fetch(new Request(
          `https://brain-service/process`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ query: content, image_data_base64: image_data_base64, session_id: this.sessionId })
          }
        ));
        const aiResult = await brainResponse.json();
        if (aiResult?.answer) {
          await this.addMessage('assistant', aiResult.answer);
        } else {
          await this.addMessage('assistant', 'Przepraszam, nie mogę teraz odpowiedzieć.');
        }
      }
      const currentMessages = await this.getMessages();
      return new Response(JSON.stringify({ ok: true, messages: currentMessages }), { headers: { 'Content-Type': 'application/json' } });
    }

    if (url.pathname.endsWith('/history')) {
      const currentMessages = await this.getMessages();
      return new Response(JSON.stringify({ messages: currentMessages }), { headers: { 'Content-Type': 'application/json' } });
    }

    return new Response(JSON.stringify({ sessionId: this.sessionId, messages: await this.getMessages() }), { headers: { 'Content-Type': 'application/json' } });
  }

  async alarm(): Promise<void> {
    console.log(`[${this.sessionId}] Alarm triggered. Syncing messages to D1 archive.`);
    const allMessages = await this.getMessages(); // Pobierz wszystkie wiadomości z wewnętrznego SQLite
    if (allMessages.length === 0) {
      return;
    }

    try {
      // Wstaw lub zaktualizuj całą sesję w D1 (messages jako JSON)
      await this.env.AI_ASSISTANT_SESSIONS_DB.prepare(
        'INSERT OR REPLACE INTO ai_sessions_archive (id, customer_id, start_time, messages, end_time) VALUES (?, ?, JSON(?), ?, ?)'
      )
        .bind(
          this.sessionId,
          'TODO_CUSTOMER_ID', // TODO: customer_id powinien być przekazywany/zarządzany
          JSON.stringify(allMessages),
          new Date(allMessages[0]?.timestamp || Date.now()).toISOString(),
          new Date().toISOString()
        )
        .run();

      // Po udanej archiwizacji, usuń zsynchornizowane wiadomości z wewnętrznego SQLite
      // (zakładając, że cała sesja została zarchiwizowana, a DO ma tylko buforować)
      await this.sql.exec('DELETE FROM local_messages');
      console.log(`[${this.sessionId}] Session archived to D1 and cleared from DO internal SQLite.`);
    } catch (error) {
      console.error(`[${this.sessionId}] Error archiving session to D1:`, error);
      // Ponów próbę za 30 sekund w przypadku błędu D1
      await this.state.storage.setAlarm(Date.now() + 30 * 1000);
    }
  }
}
