import { cellArea, latLngToCell } from 'h3-js';
import { CRIME_WEIGHTS, type CrimeCategory } from '../config/crimeWeights';

/** Resoluções gravadas: 7 (zoom afastado), 8 (padrão) e 9 (zoom próximo). */
export const RESOLUTIONS = [7, 8, 9] as const;

export interface CellStats {
  weight: number;
  total: number;
  byCategory: Partial<Record<CrimeCategory, number>>;
  /** Fração de BOs sem coordenada distribuídos pelo distrito (ver addDistributed). */
  distributed: Partial<Record<CrimeCategory, number>>;
}

const emptyStats = (): CellStats => ({ weight: 0, total: 0, byCategory: {}, distributed: {} });

export type Aggregation = Map<number, Map<string, CellStats>>;

export function newAggregation(): Aggregation {
  return new Map(RESOLUTIONS.map((r) => [r, new Map<string, CellStats>()]));
}

export function addOccurrence(agg: Aggregation, lat: number, lng: number, category: CrimeCategory): void {
  const weight = CRIME_WEIGHTS[category];
  for (const [res, cells] of agg) {
    const h = latLngToCell(lat, lng, res);
    let s = cells.get(h);
    if (!s) cells.set(h, (s = emptyStats()));
    s.weight += weight;
    s.total += 1;
    s.byCategory[category] = (s.byCategory[category] ?? 0) + 1;
  }
}

/**
 * BO sem coordenada mas com distrito conhecido: o peso é dividido igualmente entre os hexágonos do distrito
 * (todos têm praticamente a mesma área), em vez de cair inteiro num ponto como o centroide.
 */
export function addDistributed(agg: Aggregation, districtCells: Map<number, string[]>, category: CrimeCategory): void {
  const weight = CRIME_WEIGHTS[category];
  for (const [res, cells] of agg) {
    const list = districtCells.get(res) ?? [];
    for (const h of list) {
      let s = cells.get(h);
      if (!s) cells.set(h, (s = emptyStats()));
      s.weight += weight / list.length;
      s.distributed[category] = (s.distributed[category] ?? 0) + 1 / list.length;
    }
  }
}

/** Densidade ponderada: soma dos pesos por km² (os hexágonos H3 variam um pouco de área). */
export function density(h3: string, stats: CellStats | undefined): number {
  return stats ? stats.weight / cellArea(h3, 'km2') : 0;
}

/** Quantil por interpolação linear de uma lista já ordenada. */
export function quantile(sorted: number[], q: number): number {
  if (!sorted.length) return 0;
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

/** Percentis dos cortes entre os 10 níveis: faixas mais estreitas no topo, onde a diferença entre lugares é maior. */
export const QUANTIS_DOS_CORTES = [0.15, 0.3, 0.45, 0.6, 0.72, 0.82, 0.9, 0.95, 0.98] as const;
export const TOTAL_NIVEIS = QUANTIS_DOS_CORTES.length + 1;
export type Nivel = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10;

/**
 * Cortes dos níveis 1..10: percentis (QUANTIS_DOS_CORTES) do score dos hexágonos COM BO de coordenada, calculados
 * separadamente em cada resolução (cada zoom compara áreas do mesmo tamanho; com cortes únicos, o hexágono pequeno
 * concentrava densidades extremas no nível mais alto). Mesma regra da migration escala_de_10_niveis_por_resolucao.
 */
export function levelBreaks(densities: number[]): number[] {
  const sorted = densities.filter((d) => d > 0).sort((a, b) => a - b);
  return QUANTIS_DOS_CORTES.map((q) => quantile(sorted, q));
}

/** Sem ocorrência → nível 1; senão, quantos cortes a densidade ultrapassa + 1. */
export function levelFor(d: number, breaks: readonly number[]): Nivel {
  if (d <= 0) return 1;
  return (1 + breaks.filter((b) => d > b).length) as Nivel;
}
