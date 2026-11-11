/**
 * Backup de hex_cells antes de uma gravação (só lê o Supabase): h3_index, resolution, score, level, counts, period e
 * updated_at (sem a geometria, que não muda) em scripts/out/backup/hex_cells_<AAAA-MM-DD>.json.gz.
 * A volta é o `npm run data:restaurar-backup`.
 *
 *   npm run data:backup
 */
import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import { outDir } from './src/lib/paths';
import { adminClient } from './src/lib/supabase';

export const pastaBackup = () => path.join(outDir, 'backup');
export const COLUNAS_BACKUP = 'h3_index, resolution, score, level, counts, period, updated_at';

export interface CelulaBackup {
  h3_index: string;
  resolution: number;
  score: number;
  level: number;
  counts: Record<string, unknown>;
  period: string;
  updated_at: string;
}

export function lerBackup(arquivo: string): CelulaBackup[] {
  return JSON.parse(zlib.gunzipSync(fs.readFileSync(arquivo)).toString('utf-8')) as CelulaBackup[];
}

async function main() {
  const db = adminClient();
  const { count, error: eCount } = await db.from('hex_cells').select('h3_index', { count: 'exact', head: true });
  if (eCount) throw new Error(eCount.message);
  const linhas: CelulaBackup[] = [];
  for (let de = 0; ; de += 1000) {
    const { data, error } = await db.from('hex_cells').select(COLUNAS_BACKUP).order('h3_index').range(de, de + 999);
    if (error) throw new Error(error.message);
    linhas.push(...((data ?? []) as CelulaBackup[]));
    if (!data || data.length < 1000) break;
  }
  if (linhas.length !== count) throw new Error(`Li ${linhas.length} linhas, mas o banco tem ${count}.`);
  fs.mkdirSync(pastaBackup(), { recursive: true });
  const arquivo = path.join(pastaBackup(), `hex_cells_${new Date().toISOString().slice(0, 10)}.json.gz`);
  if (fs.existsSync(arquivo)) throw new Error(`${arquivo} já existe: não sobrescrevo um backup.`);
  fs.writeFileSync(arquivo, zlib.gzipSync(JSON.stringify(linhas)));

  // confere que o arquivo abre e bate
  const lido = lerBackup(arquivo);
  const porRes: Record<number, number> = {};
  for (const l of lido) porRes[l.resolution] = (porRes[l.resolution] ?? 0) + 1;
  const unicos = new Set(lido.map((l) => l.h3_index)).size;
  console.log(`Backup: ${arquivo}`);
  console.log(`  ${lido.length} linhas (${unicos} únicas; ${Object.entries(porRes).map(([r, n]) => `res ${r}: ${n}`).join(', ')}), ${(fs.statSync(arquivo).size / 1e6).toFixed(1)} MB`);
  console.log(`  period: ${[...new Set(lido.map((l) => l.period))].join(', ')}; níveis ${Math.min(...lido.map((l) => l.level))}–${Math.max(...lido.map((l) => l.level))}`);
  if (lido.length !== count || unicos !== count) throw new Error('O backup não confere com o banco.');
}

if (require.main === module)
  main().catch((err) => {
    console.error(process.env.DEBUG && err instanceof Error ? err.stack : err instanceof Error ? err.message : err);
    process.exit(1);
  });
