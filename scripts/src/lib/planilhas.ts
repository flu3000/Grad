import fs from 'fs';
import path from 'path';

export interface Planilha {
  caminho: string;
  /** Ano de registro do arquivo: nome da pasta (data/SSP-SP/2024/...) ou o ano no nome do arquivo. */
  ano: number | null;
}

/** Ano de uma planilha pelo caminho: pasta "AAAA" tem prioridade; senão, o primeiro "20AA" do nome. */
export function anoDaPlanilha(caminho: string): number | null {
  const pasta = path.basename(path.dirname(caminho));
  if (/^(19|20)\d{2}$/.test(pasta)) return Number(pasta);
  const m = path.basename(caminho).match(/(?:^|\D)(20\d{2})(?:\D|$)/);
  return m ? Number(m[1]) : null;
}

/** Todas as .xlsx em `dir` e em subpastas (ignora `limpo/`, pastas que começam com "_" (ex.: `_antigo/`) e temporários do Excel). */
export function listarPlanilhas(dir: string): Planilha[] {
  if (!fs.existsSync(dir)) return [];
  const out: Planilha[] = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory() && e.name !== 'limpo' && !e.name.startsWith('_')) out.push(...listarPlanilhas(p));
    else if (e.isFile() && e.name.toLowerCase().endsWith('.xlsx') && !e.name.startsWith('~$')) out.push({ caminho: p, ano: anoDaPlanilha(p) });
  }
  return out.sort((a, b) => (a.ano ?? 0) - (b.ano ?? 0) || a.caminho.localeCompare(b.caminho));
}
