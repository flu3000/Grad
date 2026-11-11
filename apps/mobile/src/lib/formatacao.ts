/**
 * Formatação de números, distâncias, percentis e anos para os textos do app. Funções puras (sem React Native).
 * Linguagem neutra: o boletim de ocorrência mede o que foi registrado, então os textos falam em "registros".
 */

const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

/** 1552 → "1.552"; 1.25 → "1,3" (com `casas`). Sem Intl: o Hermes nem sempre traz os dados de pt-BR. */
export function numero(n: number, casas = 0): string {
  const fixo = Math.abs(n).toFixed(casas);
  const [inteira, decimal] = fixo.split('.');
  const comPontos = inteira.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  const sinal = n < 0 && Number(fixo) !== 0 ? '-' : '';
  return `${sinal}${comPontos}${decimal ? `,${decimal}` : ''}`;
}

/** Distância em linha reta: 350 → "350 m"; 1234 → "1,2 km"; 12500 → "13 km". */
export function distancia(metros: number): string {
  if (metros < 1000) return `${Math.round(metros / 10) * 10} m`;
  const km = metros / 1000;
  return `${numero(km, km < 10 ? 1 : 0)} km`;
}

/** Percentil da cidade (0–100) → "Mais registros que 92% das áreas da cidade". */
export function textoPercentil(percentil: number): string {
  if (percentil >= 99.5) return 'Entre as áreas com mais registros da cidade';
  if (percentil < 1) return 'Entre as áreas com menos registros da cidade';
  return `Mais registros que ${Math.floor(percentil)}% das áreas da cidade`;
}

/** "cerca de 2/3", "cerca de metade", "4 em cada 10", "quase todos". */
export function proporcao(pct: number): string {
  if (pct >= 97) return 'quase todos';
  for (const [texto, v] of [['metade', 50], ['1/3', 100 / 3], ['1/4', 25], ['2/3', 200 / 3], ['3/4', 75]] as const)
    if (Math.abs(pct - v) <= 2.5) return `cerca de ${texto}`;
  const em10 = Math.round(pct / 10);
  return em10 >= 1 ? `${em10} em cada 10` : `${numero(pct, pct < 1 ? 1 : 0)}%`;
}

/** Porcentagem curta: 0,51 → "0,5%"; 18,9 → "19%". */
export const porcentagem = (pct: number) => `${numero(pct, pct < 10 && pct !== Math.round(pct) ? 1 : 0)}%`;

/** Meses cobertos: 8 → "jan–ago"; 1 → "jan"; 12 → "jan–dez". */
export const intervaloDeMeses = (ultimoMes: number) =>
  ultimoMes <= 1 ? MESES[0] : `${MESES[0]}–${MESES[Math.min(12, ultimoMes) - 1]}`;

export interface AnoInfo {
  ano: number;
  completo: boolean;
  /** último mês completo (1–12) */
  ultimoMes: number;
}

/** Chip e lista de anos: "2025" ou "2026 (jan–ago)". */
export const rotuloAno = (a: AnoInfo) => (a.completo ? String(a.ano) : `${a.ano} (${intervaloDeMeses(a.ultimoMes)})`);

/** Fonte do relatório: "SSP-SP, 2025" ou "SSP-SP, jan–ago 2026". */
export const rotuloFonte = (a: AnoInfo) => (a.completo ? `SSP-SP, ${a.ano}` : `SSP-SP, ${intervaloDeMeses(a.ultimoMes)} ${a.ano}`);

/** Quantidade de uma categoria: número ou "<3" (sigilo da LGPD para poucos casos de estupro). */
export const quantidade = (v: number | '<3') => (v === '<3' ? 'menos de 3' : numero(v));
