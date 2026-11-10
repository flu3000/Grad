import fs from 'fs';
import path from 'path';

const ROOT = path.resolve(__dirname, '../../..');

/** Pasta de dados: `data/` na raiz (depois da Fase 2.3) ou `apps/api/data/` (enquanto a API legada existir). */
export function dataDir(): string {
  const candidates = [path.join(ROOT, 'data'), path.join(ROOT, 'apps/api/data')];
  const found = candidates.find((dir) => fs.existsSync(path.join(dir, 'geosampa')));
  if (!found) throw new Error(`Pasta de dados não encontrada em: ${candidates.join(', ')}`);
  return found;
}

export const outDir = path.join(ROOT, 'scripts/out');

/** Lê `--nome=valor` ou `--flag` da linha de comando. */
export function arg(name: string): string | undefined {
  const prefix = `--${name}=`;
  const hit = process.argv.find((a) => a === `--${name}` || a.startsWith(prefix));
  if (!hit) return undefined;
  return hit === `--${name}` ? 'true' : hit.slice(prefix.length);
}
