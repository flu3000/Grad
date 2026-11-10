import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/** Cliente com a chave secreta (ignora RLS). Só para scripts locais; nunca usar no app. */
export function adminClient(): SupabaseClient {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) {
    throw new Error('Defina SUPABASE_URL e SUPABASE_SECRET_KEY em scripts/.env (veja scripts/.env.example).');
  }
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

/** Grava em lotes com upsert pela chave primária. */
export async function upsertInBatches<T extends object>(
  client: SupabaseClient,
  table: string,
  rows: T[],
  onConflict: string,
  batchSize = 500,
): Promise<void> {
  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize);
    const { error } = await client.from(table).upsert(batch, { onConflict });
    if (error) throw new Error(`Erro gravando ${table} (linhas ${i}–${i + batch.length - 1}): ${error.message}`);
    process.stdout.write(`  ${table}: ${Math.min(i + batchSize, rows.length)}/${rows.length}\r`);
  }
  process.stdout.write('\n');
}
