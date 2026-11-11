/**
 * Períodos do dia e horas, como no banco (madrugada 0–5, manhã 6–11, tarde 12–17, noite 18–23).
 * Funções puras (sem React Native), testadas em apps/mobile/test.
 */

export type IndicePeriodo = 0 | 1 | 2 | 3;
export type ChavePeriodo = 'madrugada' | 'manha' | 'tarde' | 'noite';

export const PERIODOS: { chave: ChavePeriodo; nome: string; inicio: number; fim: number }[] = [
  { chave: 'madrugada', nome: 'Madrugada', inicio: 0, fim: 6 },
  { chave: 'manha', nome: 'Manhã', inicio: 6, fim: 12 },
  { chave: 'tarde', nome: 'Tarde', inicio: 12, fim: 18 },
  { chave: 'noite', nome: 'Noite', inicio: 18, fim: 24 },
];

export const INDICES_PERIODO: IndicePeriodo[] = [0, 1, 2, 3];

/** Período (0–3) de uma hora (0–23). */
export const periodoDaHora = (hora: number): IndicePeriodo => Math.min(3, Math.max(0, Math.floor(hora / 6))) as IndicePeriodo;

/** Período de agora pelo relógio do aparelho. */
export const periodoAtual = (agora = new Date()) => periodoDaHora(agora.getHours());

/** "18h–24h" */
export const intervaloDoPeriodo = (p: IndicePeriodo) => `${PERIODOS[p].inicio}h–${PERIODOS[p].fim}h`;

/** "Noite · 18h–24h" */
export const rotuloPeriodo = (p: IndicePeriodo) => `${PERIODOS[p].nome} · ${intervaloDoPeriodo(p)}`;

/** "noite" (para frases: "Agora (noite)") */
export const nomeDoPeriodo = (p: IndicePeriodo) => PERIODOS[p].nome.toLowerCase();

/**
 * O nível por hora do banco usa uma janela de 3 h centrada na hora (h−1, h, h+1).
 * Rótulo da janela: 19 → "18h–21h"; 0 → "23h–2h".
 */
export function janelaDaHora(hora: number): string {
  const h = ((Math.round(hora) % 24) + 24) % 24;
  const inicio = (h + 23) % 24;
  const fim = (h + 2) % 24;
  return `${inicio}h–${fim === 0 ? 24 : fim}h`;
}

/** "19h" */
export const rotuloHora = (hora: number) => `${hora}h`;
