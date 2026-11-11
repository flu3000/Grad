import { latLngToCell } from 'h3-js';
import type { CrimeCategory } from '../config/crimeWeights';
import { PERIODOS, type Periodo } from './horario';
import { RESOLUTIONS } from './scoring';

/**
 * Agregação por (resolução, hexágono H3, ano da ocorrência). É aditiva: as parciais de cada parte de 100 mil linhas
 * são somadas na consolidação (`somar`). Arrays em ordem fixa: períodos (madrugada, manhã, tarde, noite),
 * horas 0..23 e meses jan..dez.
 *
 * `total*` contam só BOs com ponto (coordenada da SSP ou geocodificada); `weight*` incluem também a fração dos BOs
 * distribuídos pelo distrito (estupro sem coordenada).
 */
export interface Celula {
  weight: number;
  total: number;
  byCategory: Partial<Record<CrimeCategory, number>>;
  distributed: Partial<Record<CrimeCategory, number>>;
  weightByPeriod: number[];
  totalByPeriod: number[];
  weightSemPeriodo: number;
  semPeriodo: number;
  weightByHour: number[];
  totalByHour: number[];
  weightSemHora: number;
  semHora: number;
  weightByMonth: number[];
  totalByMonth: number[];
  /** Categorias (contagem de BOs com ponto) dentro de cada período. */
  byPeriod: Partial<Record<CrimeCategory, number>>[];
  /** BOs sem ponto usável da SSP que ganharam o do endereço */
  geocodificado: number;
  /** BOs com ponto suspeito trocado pelo do endereço */
  trocado: number;
}

export const novaCelula = (): Celula => ({
  weight: 0,
  total: 0,
  byCategory: {},
  distributed: {},
  weightByPeriod: [0, 0, 0, 0],
  totalByPeriod: [0, 0, 0, 0],
  weightSemPeriodo: 0,
  semPeriodo: 0,
  weightByHour: Array(24).fill(0),
  totalByHour: Array(24).fill(0),
  weightSemHora: 0,
  semHora: 0,
  weightByMonth: Array(12).fill(0),
  totalByMonth: Array(12).fill(0),
  byPeriod: [{}, {}, {}, {}],
  geocodificado: 0,
  trocado: 0,
});

/** Chave "res|h3|ano". */
export type Agregado = Map<string, Celula>;
export const chave = (res: number, h3: string, ano: number) => `${res}|${h3}|${ano}`;
export const lerChave = (k: string) => {
  const [res, h3, ano] = k.split('|');
  return { res: Number(res), h3, ano: Number(ano) };
};

export interface Ocorrencia {
  ano: number;
  mes: number; // 1..12
  hora: number | null; // 0..23 (só hora exata)
  periodo: Periodo | null; // pela hora, ou pelo DESC_PERIODO quando não há hora
  categoria: CrimeCategory;
  peso: number;
}

const inc = <K extends string>(o: Partial<Record<K, number>>, k: K, n: number) => {
  o[k] = (o[k] ?? 0) + n;
};

function somarNaCelula(c: Celula, o: Ocorrencia, fracao: number, ponto: boolean) {
  const w = o.peso * fracao;
  const n = ponto ? 1 : 0;
  c.weight += w;
  c.total += n;
  if (ponto) inc(c.byCategory, o.categoria, 1);
  else inc(c.distributed, o.categoria, fracao);
  const p = o.periodo ? PERIODOS.indexOf(o.periodo) : -1;
  if (p >= 0) {
    c.weightByPeriod[p] += w;
    c.totalByPeriod[p] += n;
    if (ponto) inc(c.byPeriod[p], o.categoria, 1);
  } else {
    c.weightSemPeriodo += w;
    c.semPeriodo += n;
  }
  if (o.hora !== null) {
    c.weightByHour[o.hora] += w;
    c.totalByHour[o.hora] += n;
  } else {
    c.weightSemHora += w;
    c.semHora += n;
  }
  c.weightByMonth[o.mes - 1] += w;
  c.totalByMonth[o.mes - 1] += n;
}

function celula(agg: Agregado, k: string): Celula {
  let c = agg.get(k);
  if (!c) agg.set(k, (c = novaCelula()));
  return c;
}

/** BO com ponto: entra inteiro no hexágono de cada resolução. */
export function somarPonto(agg: Agregado, lat: number, lng: number, o: Ocorrencia, origem: 'ssp' | 'geocodificado' | 'trocado' = 'ssp') {
  for (const res of RESOLUTIONS) {
    const c = celula(agg, chave(res, latLngToCell(lat, lng, res), o.ano));
    somarNaCelula(c, o, 1, true);
    if (origem === 'geocodificado') c.geocodificado++;
    if (origem === 'trocado') c.trocado++;
  }
}

/** BO sem ponto com distrito conhecido: o peso é dividido igualmente entre os hexágonos do distrito. */
export function somarDistribuido(agg: Agregado, hexDoDistrito: ReadonlyMap<number, readonly string[]>, o: Ocorrencia) {
  for (const res of RESOLUTIONS) {
    const lista = hexDoDistrito.get(res) ?? [];
    for (const h of lista) somarNaCelula(celula(agg, chave(res, h, o.ano)), o, 1 / lista.length, false);
  }
}

const somarArray = (a: number[], b: number[]) => a.forEach((_, i) => (a[i] += b[i]));
const somarObj = <K extends string>(a: Partial<Record<K, number>>, b: Partial<Record<K, number>>) => {
  for (const [k, v] of Object.entries(b) as [K, number][]) inc(a, k, v);
};

/** a += b (in place). */
export function somarCelula(a: Celula, b: Celula) {
  a.weight += b.weight;
  a.total += b.total;
  somarObj(a.byCategory, b.byCategory);
  somarObj(a.distributed, b.distributed);
  somarArray(a.weightByPeriod, b.weightByPeriod);
  somarArray(a.totalByPeriod, b.totalByPeriod);
  a.weightSemPeriodo += b.weightSemPeriodo;
  a.semPeriodo += b.semPeriodo;
  somarArray(a.weightByHour, b.weightByHour);
  somarArray(a.totalByHour, b.totalByHour);
  a.weightSemHora += b.weightSemHora;
  a.semHora += b.semHora;
  somarArray(a.weightByMonth, b.weightByMonth);
  somarArray(a.totalByMonth, b.totalByMonth);
  b.byPeriod.forEach((o, i) => somarObj(a.byPeriod[i], o));
  a.geocodificado += b.geocodificado;
  a.trocado += b.trocado ?? 0;
}

export function somar(destino: Agregado, origem: Agregado | Record<string, Celula>) {
  for (const [k, c] of origem instanceof Map ? origem : Object.entries(origem)) {
    const d = destino.get(k);
    if (d) somarCelula(d, c);
    else destino.set(k, structuredClone(c));
  }
}

// ------------------------------------------------------------- níveis por período, por hora e anualização

/** Horas de cada período (padrão: 6 cada). */
export const HORAS_DO_PERIODO = [6, 6, 6, 6];

/** Fator de anualização do ano parcial: 12 / meses cobertos (1 se o ano está completo). */
export const fatorAnual = (mesesCobertos: number) => 12 / mesesCobertos;

/** Soma dos meses 1..mesesCobertos (o resto, ainda incompleto pelo registro tardio, fica de fora). */
export const somaDosMeses = (porMes: readonly number[], mesesCobertos: number) => porMes.slice(0, mesesCobertos).reduce((a, b) => a + b, 0);

/**
 * Densidade anual "equivalente a um dia inteiro" de cada período:
 * pesoPeriodo × (24 / horasDoPeriodo) × fatorPeriodo / área, com fatorPeriodo = pesoTotal / pesoComPeriodo da cidade
 * no ano (corrige os BOs sem período sem gerar ruído por hexágono). `escala` aplica a anualização.
 */
export function densidadesPorPeriodo(pesoPorPeriodo: readonly number[], areaKm2: number, fatorPeriodo: number, escala = 1): number[] {
  return pesoPorPeriodo.map((w, i) => (w * (24 / HORAS_DO_PERIODO[i]) * fatorPeriodo * escala) / areaKm2);
}

/** Janela móvel de 3 h centrada (h-1, h, h+1, circular), convertida em "equivalente a um dia": média × 24. */
export function densidadesPorHora(pesoPorHora: readonly number[], areaKm2: number, fatorHora: number, escala = 1): number[] {
  return pesoPorHora.map((_, h) => {
    const janela = pesoPorHora[(h + 23) % 24] + pesoPorHora[h] + pesoPorHora[(h + 1) % 24];
    return ((janela / 3) * 24 * fatorHora * escala) / areaKm2;
  });
}
