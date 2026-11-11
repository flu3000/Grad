/**
 * Devolve level/score/counts/period de hex_cells ao backup do data:backup (a geometria não muda).
 *
 *   npm run data:restaurar-backup                        → SIMULA: compara o backup mais recente com o banco
 *   npm run data:restaurar-backup -- --arquivo=<caminho> → usa outro backup
 *   npm run data:restaurar-backup -- --gravar            → regrava as linhas diferentes. Só com o pedido do dono.
 *
 * Não insere nem apaga linhas: só atualiza hexágonos que existem no banco e no backup.
 * Faz parte do rollback (supabase/rollback/*.down.sql).
 */
import fs from 'fs';
import path from 'path';
import { arg } from './src/lib/paths';
import { adminClient } from './src/lib/supabase';
import { COLUNAS_BACKUP, lerBackup, pastaBackup, type CelulaBackup } from './backup';

const LOTE = 200;
const EM_PARALELO = 8;

/** jsonb volta com as chaves em outra ordem: compara pelo conteúdo. */
const canonico = (v: unknown): string =>
  v && typeof v === 'object' && !Array.isArray(v)
    ? `{${Object.keys(v as object).sort().map((k) => `${JSON.stringify(k)}:${canonico((v as Record<string, unknown>)[k])}`).join(',')}}`
    : JSON.stringify(v);
const valores = (c: Pick<CelulaBackup, 'level' | 'score' | 'counts' | 'period'>) => canonico({ level: c.level, score: Number(c.score), counts: c.counts, period: c.period });

async function main() {
  const gravar = arg('gravar') === 'true';
  const arquivo =
    arg('arquivo') ??
    path.join(
      pastaBackup(),
      fs.readdirSync(pastaBackup()).filter((f) => /^hex_cells_.*\.json\.gz$/.test(f)).sort().at(-1) ?? 'nenhum',
    );
  if (!fs.existsSync(arquivo)) throw new Error(`Backup não encontrado: ${arquivo}`);
  const backup = lerBackup(arquivo);
  console.log(`Backup: ${arquivo} (${backup.length} linhas)`);

  const db = adminClient();
  const atual = new Map<string, CelulaBackup>();
  for (let de = 0; ; de += 1000) {
    const { data, error } = await db.from('hex_cells').select(COLUNAS_BACKUP).order('h3_index').range(de, de + 999);
    if (error) throw new Error(error.message);
    for (const c of (data ?? []) as CelulaBackup[]) atual.set(c.h3_index, c);
    if (!data || data.length < 1000) break;
  }
  const faltando = backup.filter((b) => !atual.has(b.h3_index)).length;
  const diferentes = backup.filter((b) => atual.has(b.h3_index) && valores(atual.get(b.h3_index)!) !== valores(b));
  console.log(`Banco: ${atual.size} linhas; ${diferentes.length} diferentes do backup; ${faltando} do backup sem linha no banco (ignoradas)`);
  const porNivel = new Map<string, number>();
  for (const b of diferentes) {
    const k = `${atual.get(b.h3_index)!.level} → ${b.level}`;
    porNivel.set(k, (porNivel.get(k) ?? 0) + 1);
  }
  console.log(`  nível banco → backup: ${[...porNivel].sort((a, b) => b[1] - a[1]).slice(0, 12).map(([k, n]) => `${k}: ${n}`).join(', ')}`);

  if (!gravar) {
    console.log('\nSimulação: nada foi gravado. Para restaurar (com o pedido do dono): npm run data:restaurar-backup -- --gravar');
    return;
  }

  // agrupa as linhas com os mesmos valores (ex.: todos os hexágonos vazios) para atualizar com um filtro "in"
  const grupos = new Map<string, { valores: Omit<CelulaBackup, 'h3_index' | 'resolution' | 'updated_at'>; ids: string[] }>();
  for (const b of diferentes) {
    const k = valores(b);
    const g = grupos.get(k) ?? { valores: { level: b.level, score: b.score, counts: b.counts, period: b.period }, ids: [] };
    g.ids.push(b.h3_index);
    grupos.set(k, g);
  }
  const tarefas = [...grupos.values()].flatMap((g) => {
    const out: { valores: typeof g.valores; ids: string[] }[] = [];
    for (let i = 0; i < g.ids.length; i += LOTE) out.push({ valores: g.valores, ids: g.ids.slice(i, i + LOTE) });
    return out;
  });
  let feitas = 0;
  let linhas = 0;
  const fila = [...tarefas];
  await Promise.all(
    Array.from({ length: EM_PARALELO }, async () => {
      for (let t = fila.shift(); t; t = fila.shift()) {
        const { error, count } = await db.from('hex_cells').update({ ...t.valores, updated_at: new Date().toISOString() }, { count: 'exact' }).in('h3_index', t.ids);
        if (error) throw new Error(`hex_cells: ${error.message}`);
        linhas += count ?? 0;
        process.stdout.write(`  ${++feitas}/${tarefas.length} atualizações\r`);
      }
    }),
  );
  console.log(`\nRestauradas ${linhas} linhas de hex_cells.`);
}

main().catch((err) => {
  console.error(process.env.DEBUG && err instanceof Error ? err.stack : err instanceof Error ? err.message : err);
  process.exit(1);
});
