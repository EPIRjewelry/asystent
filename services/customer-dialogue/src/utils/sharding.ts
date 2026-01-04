// Prosty placeholder: zwraca domyślną bazę. Rozbuduj, gdy dodasz wiele shardów.
export function getShardedD1(env: any, _id: string) {
  return env.AI_ASSISTANT_SESSIONS_DB;
}
