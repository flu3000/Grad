import { normalizeText } from '../config/crimeWeights';

/** Períodos do dia, sempre nesta ordem nos arrays gravados (madrugada, manhã, tarde, noite). */
export const PERIODOS = ['madrugada', 'manha', 'tarde', 'noite'] as const;
export type Periodo = (typeof PERIODOS)[number];

/** Hora em que cada período começa (padrão: 0–5h, 6–11h, 12–17h, 18–23h). Confirmada pelo diagnóstico. */
export const INICIO_DOS_PERIODOS: Record<Periodo, number> = { madrugada: 0, manha: 6, tarde: 12, noite: 18 };

/** Período calculado pela hora (0..23). */
export function periodoDaHora(h: number, inicio: Record<Periodo, number> = INICIO_DOS_PERIODOS): Periodo {
  let atual: Periodo = 'noite'; // antes do primeiro início, volta para o último período (circular)
  for (const p of [...PERIODOS].sort((a, b) => inicio[a] - inicio[b])) if (h >= inicio[p]) atual = p;
  return atual;
}

export type PeriodoTexto = Periodo | 'incerta' | null;

/** `DESC_PERIODO` → período. "Em hora incerta" → 'incerta'; vazio/NULL/desconhecido → null. */
export function periodoDoTexto(desc: string | null | undefined): PeriodoTexto {
  const t = normalizeText(desc ?? '');
  if (!t || t === 'NULL') return null;
  if (t.includes('MADRUGADA')) return 'madrugada';
  if (t.includes('MANHA')) return 'manha';
  if (t.includes('TARDE')) return 'tarde';
  if (t.includes('NOITE')) return 'noite';
  if (t.includes('INCERTA')) return 'incerta';
  return null;
}
