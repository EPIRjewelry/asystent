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
      const body = await request.json();
      const { role, content, image_data_base64 } = body as { role: Message['role']; content: string; image_data_base64?: string };
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
    const BATCH_SIZE = 50; // Ile wiadomości synchronizować na raz
    const HOT_CONTEXT_LIMIT = 20; // Ile wiadomości trzymać w SQLite

    // Krok 1: Pobierz ID wiadomości do synchronizacji
    const unsyncedMessagesStmt = this.sql.prepare('SELECT id FROM local_messages WHERE synced = 0 LIMIT ?');
    const unsyncedMessageIds = (await unsyncedMessagesStmt.bind(BATCH_SIZE).all()).results.map((row: any) => row.id);

    if (unsyncedMessageIds.length === 0) {
      console.log(`[${this.sessionId}] Alarm triggered, but no messages to sync.`);
      // Opcjonalnie: wyczyść stare wiadomości, jeśli nie ma nic do synchronizacji
      await this.sql.prepare('DELETE FROM local_messages WHERE id NOT IN (SELECT id FROM local_messages ORDER BY timestamp DESC LIMIT ?)').bind(HOT_CONTEXT_LIMIT).run();
      return;
    }

    console.log(`[${this.sessionId}] Alarm triggered. Syncing ${unsyncedMessageIds.length} messages to D1 archive.`);

    try {
      // Krok 2: Pobierz pełną historię sesji, aby zaktualizować archiwum
      // D1 przechowuje całą sesję w jednym wierszu JSON, więc musimy zaktualizować całość
      const allMessages = await this.getMessages();

      // Krok 3: Zaktualizuj archiwum w D1
      await this.env.AI_ASSISTANT_SESSIONS_DB.prepare(
        'INSERT OR REPLACE INTO ai_sessions_archive (id, customer_id, messages, start_time, end_time) VALUES (?, ?, ?, ?, ?)'
      )
        .bind(
          this.sessionId,
          'TODO_CUSTOMER_ID', // TODO: customer_id
          JSON.stringify(allMessages),
          new Date(allMessages[0]?.timestamp || Date.now()).toISOString(),
          new Date().toISOString()
        )
        .run();

      // Krok 4: Oznacz wiadomości jako zsynchronizowane w SQLite
      const updateStmt = this.sql.prepare(`UPDATE local_messages SET synced = 1 WHERE id IN (${'?,'.repeat(unsyncedMessageIds.length).slice(0, -1)})`);
      await updateStmt.bind(...unsyncedMessageIds).run();
      
      console.log(`[${this.sessionId}] Marked ${unsyncedMessageIds.length} messages as synced.`);

      // Krok 5: Przytnij historię w SQLite do "gorącego kontekstu"
      await this.sql.prepare('DELETE FROM local_messages WHERE id NOT IN (SELECT id FROM local_messages ORDER BY timestamp DESC LIMIT ?)').bind(HOT_CONTEXT_LIMIT).run();

      console.log(`[${this.sessionId}] Session archived to D1 and SQLite context truncated.`);
    } catch (error) {
      console.error(`[${this.sessionId}] Error archiving session to D1:`, error);
      // Ponów próbę za 30 sekund w przypadku błędu D1
      await this.state.storage.setAlarm(Date.now() + 30 * 1000);
    }
  }
}
