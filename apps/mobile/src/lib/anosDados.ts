/**
 * Anos disponíveis (tabela `datasets`) e as notas da legenda. Funções puras (sem React Native); a leitura do
 * Supabase fica em anos.ts.
 */
import { porcentagem, proporcao, type AnoInfo } from './formatacao';

/** Linha de `datasets` que o app usa. */
export interface LinhaDataset {
  year: number;
  complete: boolean;
  last_complete_month: number | null;
  rows_valid: number;
  rows_no_hour: number;
  /** peso total ÷ peso com período informado (≥ 1) */
  period_factor: number;
  hidden_location: { message?: string } | null;
}

export interface Ano extends AnoInfo {
  /** % do peso dos registros sem período (só entram no "dia inteiro") */
  pctSemPeriodo: number;
  /** % dos registros com hora exata */
  pctComHora: number;
  avisoSigilo: string | null;
}

export function anoDoDataset(d: LinhaDataset): Ano {
  return {
    ano: d.year,
    completo: d.complete,
    ultimoMes: d.complete ? 12 : (d.last_complete_month ?? 12),
    pctSemPeriodo: d.period_factor > 1 ? 100 * (1 - 1 / d.period_factor) : 0,
    pctComHora: d.rows_valid > 0 ? (100 * (d.rows_valid - d.rows_no_hour)) / d.rows_valid : 0,
    avisoSigilo: d.hidden_location?.message ?? null,
  };
}

/** Do mais recente para o mais antigo. */
export const ordenarAnos = (anos: Ano[]) => [...anos].sort((a, b) => b.ano - a.ano);

/** Ano padrão: o completo mais recente (a mesma regra das funções do banco). */
export function anoPadrao(anos: Ano[]): number | null {
  const completos = anos.filter((a) => a.completo).map((a) => a.ano);
  return completos.length ? Math.max(...completos) : anos.length ? Math.max(...anos.map((a) => a.ano)) : null;
}

/** Nota da legenda no modo período. */
export function notaPeriodo(a: Pick<Ano, 'pctSemPeriodo'>): string {
  const pct = a.pctSemPeriodo < 1 ? 'Menos de 1%' : porcentagem(a.pctSemPeriodo);
  return `${pct} dos registros não informam o período e só entram no dia inteiro.`;
}

/** Nota da legenda no modo hora. */
export function notaHora(a: Pick<Ano, 'pctComHora'>): string {
  return `Baseado só nos registros com hora exata (${proporcao(a.pctComHora)}; na Paulista, menos da metade).`;
}
