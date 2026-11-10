import fs from 'fs';
import path from 'path';

const ROOT = path.resolve(__dirname, '../../..');

/** Pasta de dados na raiz do repositório (`data/`). */
export function dataDir(): string {
  const dir = path.join(ROOT, 'data');
  if (!fs.existsSync(path.join(dir, 'geosampa'))) throw new Error(`Pasta de dados não encontrada: ${dir}`);
  return dir;
}

/** Onde a planilha ficava antes da Fase 2.3 (só para avisar quem ainda não a moveu). */
export const legacySpreadsheetDir = path.join(ROOT, 'apps/api/data/SSP-SP');

export const outDir = path.join(ROOT, 'scripts/out');

/** Lê `--nome=valor` ou `--flag` da linha de comando. */
export function arg(name: string): string | undefined {
  const prefix = `--${name}=`;
  const hit = process.argv.find((a) => a === `--${name}` || a.startsWith(prefix));
  if (!hit) return undefined;
  return hit === `--${name}` ? 'true' : hit.slice(prefix.length);
}
