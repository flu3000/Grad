import { cellArea, latLngToCell } from 'h3-js';
import { CRIME_WEIGHTS, type CrimeCategory } from '../config/crimeWeights';

/** Resoluções gravadas: 7 (zoom afastado), 8 (padrão) e 9 (zoom próximo). */
export const RESOLUTIONS = [7, 8, 9] as const;
/** Resolução cujos quantis definem os cortes de nível, aplicados igual às outras. */
export const REFERENCE_RESOLUTION = 8;

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

/** Percentis dos cortes entre os 8 níveis: faixas mais estreitas no topo, onde a diferença entre lugares é maior. */
export const QUANTIS_DOS_CORTES = [0.15, 0.3, 0.45, 0.6, 0.75, 0.87, 0.95] as const;
export const TOTAL_NIVEIS = QUANTIS_DOS_CORTES.length + 1;
export type Nivel = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;

/**
 * Cortes dos níveis 1..8: percentis (QUANTIS_DOS_CORTES) do score dos hexágonos da resolução de referência que têm
 * BOs com localização. Usar os mesmos cortes (em peso/km²) em todas as resoluções mantém a cor de um lugar coerente
 * quando o zoom muda. Mesma regra da migration escala_de_8_niveis.
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
