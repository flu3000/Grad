/**
 * Tipos e validação do retorno de `address_report` (relatório de um endereço, raio de 500 m), mais as comparações
 * usadas nos textos. Funções puras (sem React Native), testadas em apps/mobile/test; a chamada ao Supabase fica em
 * relatorio.ts. Uma resposta fora do formato vira ErroRelatorio (a tela mostra o estado de erro, não quebra).
 */
import type { Nivel } from '../theme/niveis';
import { numero, intervaloDeMeses } from './formatacao';
import type { ChavePeriodo } from './tempo';

export type TipoUnidadeRelatorio = 'policia_militar' | 'policia_civil' | 'gcm' | 'bombeiros';
export const TIPOS_UNIDADE_RELATORIO: TipoUnidadeRelatorio[] = ['policia_militar', 'policia_civil', 'gcm', 'bombeiros'];

export interface NivelTotal {
  level: Nivel;
  total: number;
}

export interface PeriodoRelatorio extends NivelTotal {
  period: ChavePeriodo;
  score: number;
  top: { category: string; total: number }[];
}

export interface AnoRelatorio extends NivelTotal {
  year: number;
  score: number;
  months: number;
  complete: boolean;
}

export interface UnidadeProxima {
  id: number;
  name: string;
  address: string | null;
  lat: number;
  lng: number;
  distance_m: number;
}

export interface SegurancaPorTipo {
  nearest: UnidadeProxima | null;
  within_1km: number;
  within_2km: number;
}

export interface LocalDeEventoRelatorio {
  name: string;
  kind: 'arena' | 'rua';
  message: string;
  distance_m: number;
  pct_in_peak_days: number;
  peak_days: number;
}

export interface Relatorio {
  year: number;
  complete: boolean;
  /** meses cobertos no ano (12, ou 8 em 2026) */
  months: number;
  radius_m: number;
  hexagons: number;
  area_km2: number;
  level: Nivel;
  score: number;
  total: number;
  city_percentile: number;
  /** null: o ponto está fora do município de São Paulo */
  district: { id: number; name: string } | null;
  subprefecture: { id: number; name: string } | null;
  /** quantidade por categoria; estupro com menos de 3 registros vem como "<3" (LGPD) */
  by_category: Record<string, number | '<3'>;
  by_period: PeriodoRelatorio[];
  /** registros com hora exata, por hora (0–23) */
  by_hour: number[];
  levels_by_hour: Nivel[];
  time_precision: { exact_hour_pct: number; period_only_pct: number; none_pct: number };
  /** dia = manhã + tarde (6h–18h); noite = noite + madrugada (18h–6h) */
  day_night: { day: NivelTotal; night: NivelTotal };
  evolution: AnoRelatorio[];
  /** mesmos meses do ano parcial em todos os anos (null se todos os anos forem completos) */
  same_period: { months: number; partial_year: number | null; by_year: { year: number; total: number }[] } | null;
  event_venues: LocalDeEventoRelatorio[];
  security_units: Record<TipoUnidadeRelatorio, SegurancaPorTipo>;
  hidden_location: { message: string } | null;
}

export class ErroRelatorio extends Error {
  constructor(
    message: string,
    readonly tipo: 'formato' | 'sem_dados' | 'rede' = 'formato',
  ) {
    super(message);
    this.name = 'ErroRelatorio';
  }
}

// ---- validação leve (sem biblioteca) ----

type Obj = Record<string, unknown>;
const ehObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const falha = (campo: string): never => {
  throw new ErroRelatorio(`Resposta inesperada do relatório (${campo}).`);
};
const num = (o: Obj, k: string, campo = k): number => (typeof o[k] === 'number' && Number.isFinite(o[k]) ? (o[k] as number) : falha(campo));
const texto = (o: Obj, k: string, campo = k): string => (typeof o[k] === 'string' ? (o[k] as string) : falha(campo));
const textoOuNulo = (o: Obj, k: string): string | null => (typeof o[k] === 'string' ? (o[k] as string) : null);
const obj = (v: unknown, campo: string): Obj => (ehObj(v) ? v : falha(campo));
const lista = (v: unknown, campo: string, tamanho?: number): unknown[] =>
  Array.isArray(v) && (tamanho === undefined || v.length === tamanho) ? v : falha(campo);
const nivel = (v: unknown, campo: string): Nivel =>
  typeof v === 'number' && Number.isInteger(v) && v >= 1 && v <= 10 ? (v as Nivel) : falha(campo);
const nivelTotal = (v: unknown, campo: string): NivelTotal => {
  const o = obj(v, campo);
  return { level: nivel(o.level, `${campo}.level`), total: num(o, 'total', `${campo}.total`) };
};
const idNome = (v: unknown, campo: string) => {
  if (v === null || v === undefined) return null;
  const o = obj(v, campo);
  return { id: num(o, 'id', `${campo}.id`), name: texto(o, 'name', `${campo}.name`) };
};

const PERIODOS_VALIDOS: ChavePeriodo[] = ['madrugada', 'manha', 'tarde', 'noite'];

/** Confere o jsonb de address_report e devolve o relatório tipado (ou lança ErroRelatorio). */
export function validarRelatorio(dados: unknown): Relatorio {
  const r = obj(dados, 'raiz');
  if (r.error === 'sem_dados') throw new ErroRelatorio('Ainda não há dados para este ano.', 'sem_dados');
  if (r.error !== undefined) falha('error');

  const porCategoria: Record<string, number | '<3'> = {};
  for (const [k, v] of Object.entries(obj(r.by_category, 'by_category'))) {
    if (v === '<3' || (typeof v === 'number' && v >= 0)) porCategoria[k] = v;
    else falha(`by_category.${k}`);
  }

  const porPeriodo = lista(r.by_period, 'by_period', 4).map((v, i): PeriodoRelatorio => {
    const o = obj(v, `by_period[${i}]`);
    const period = o.period as ChavePeriodo;
    if (period !== PERIODOS_VALIDOS[i]) falha(`by_period[${i}].period`);
    return {
      period,
      ...nivelTotal(o, `by_period[${i}]`),
      score: num(o, 'score', `by_period[${i}].score`),
      top: lista(o.top, `by_period[${i}].top`).map((t, j) => {
        const ot = obj(t, `by_period[${i}].top[${j}]`);
        return { category: texto(ot, 'category'), total: num(ot, 'total') };
      }),
    };
  });

  const evolucao = lista(r.evolution, 'evolution').map((v, i): AnoRelatorio => {
    const o = obj(v, `evolution[${i}]`);
    return {
      year: num(o, 'year', `evolution[${i}].year`),
      ...nivelTotal(o, `evolution[${i}]`),
      score: num(o, 'score', `evolution[${i}].score`),
      months: num(o, 'months', `evolution[${i}].months`),
      complete: o.complete === true,
    };
  });

  let mesmoPeriodo: Relatorio['same_period'] = null;
  if (ehObj(r.same_period)) {
    const sp = r.same_period;
    mesmoPeriodo = {
      months: num(sp, 'months', 'same_period.months'),
      partial_year: typeof sp.partial_year === 'number' ? sp.partial_year : null,
      by_year: lista(sp.by_year, 'same_period.by_year').map((v, i) => {
        const o = obj(v, `same_period.by_year[${i}]`);
        return { year: num(o, 'year'), total: num(o, 'total') };
      }),
    };
  }

  const eventos = lista(r.event_venues ?? [], 'event_venues').map((v, i): LocalDeEventoRelatorio => {
    const o = obj(v, `event_venues[${i}]`);
    return {
      name: texto(o, 'name', `event_venues[${i}].name`),
      kind: o.kind === 'rua' ? 'rua' : 'arena',
      message: texto(o, 'message', `event_venues[${i}].message`),
      distance_m: num(o, 'distance_m', `event_venues[${i}].distance_m`),
      pct_in_peak_days: num(o, 'pct_in_peak_days', `event_venues[${i}].pct_in_peak_days`),
      peak_days: num(o, 'peak_days', `event_venues[${i}].peak_days`),
    };
  });

  const su = obj(r.security_units, 'security_units');
  const seguranca = {} as Record<TipoUnidadeRelatorio, SegurancaPorTipo>;
  for (const tipo of TIPOS_UNIDADE_RELATORIO) {
    const o = obj(su[tipo], `security_units.${tipo}`);
    let maisProxima: UnidadeProxima | null = null;
    if (ehObj(o.nearest)) {
      const n = o.nearest;
      maisProxima = {
        id: num(n, 'id'),
        name: texto(n, 'name'),
        address: textoOuNulo(n, 'address'),
        lat: num(n, 'lat'),
        lng: num(n, 'lng'),
        distance_m: num(n, 'distance_m'),
      };
    }
    seguranca[tipo] = { nearest: maisProxima, within_1km: num(o, 'within_1km'), within_2km: num(o, 'within_2km') };
  }

  const tp = obj(r.time_precision, 'time_precision');
  const dn = obj(r.day_night, 'day_night');
  const sigilo = ehObj(r.hidden_location) && typeof r.hidden_location.message === 'string' ? { message: r.hidden_location.message } : null;

  return {
    year: num(r, 'year'),
    complete: r.complete === true,
    months: num(r, 'months'),
    radius_m: num(r, 'radius_m'),
    hexagons: num(r, 'hexagons'),
    area_km2: num(r, 'area_km2'),
    level: nivel(r.level, 'level'),
    score: num(r, 'score'),
    total: num(r, 'total'),
    city_percentile: num(r, 'city_percentile'),
    district: idNome(r.district, 'district'),
    subprefecture: idNome(r.subprefecture, 'subprefecture'),
    by_category: porCategoria,
    by_period: porPeriodo,
    by_hour: lista(r.by_hour, 'by_hour', 24).map((v, i) => (typeof v === 'number' ? v : falha(`by_hour[${i}]`))),
    levels_by_hour: lista(r.levels_by_hour, 'levels_by_hour', 24).map((v, i) => nivel(v, `levels_by_hour[${i}]`)),
    time_precision: {
      exact_hour_pct: num(tp, 'exact_hour_pct', 'time_precision'),
      period_only_pct: num(tp, 'period_only_pct', 'time_precision'),
      none_pct: num(tp, 'none_pct', 'time_precision'),
    },
    day_night: { day: nivelTotal(dn.day, 'day_night.day'), night: nivelTotal(dn.night, 'day_night.night') },
    evolution: evolucao,
    same_period: mesmoPeriodo,
    event_venues: eventos,
    security_units: seguranca,
    hidden_location: sigilo,
  };
}

// ---- comparações para os textos ----

/** Abaixo disso, a comparação entre anos ou entre dia e noite é instável demais para virar frase. */
export const MINIMO_PARA_COMPARAR = 20;

/**
 * Dia (6h–18h) × noite (18h–6h): os dois têm 12 horas, então a razão dos totais é a razão dos registros por hora.
 * Diferença de até 15% conta como "parecidos".
 */
export function fraseDiaNoite(dn: Relatorio['day_night']): string {
  const { day, night } = dn;
  if (day.total + night.total < MINIMO_PARA_COMPARAR) return 'Poucos registros para comparar o dia e a noite.';
  if (day.total === 0) return 'Todos os registros com período informado são da noite.';
  if (night.total === 0) return 'Todos os registros com período informado são do dia.';
  const razao = night.total / day.total;
  if (razao >= 1 / 1.15 && razao <= 1.15) return 'Os registros por hora são parecidos de dia e à noite.';
  return razao > 1
    ? `À noite, os registros por hora são ${numero(razao, 1)}× os do dia.`
    : `De dia, os registros por hora são ${numero(1 / razao, 1)}× os da noite.`;
}

/**
 * Mesmo período do ano anterior. Para o ano parcial (ex.: 2026 até agosto) compara os mesmos meses de 2025;
 * para um ano completo, compara com o ano anterior inteiro (evolution).
 * Ex.: "jan–ago 2026: 1.552 registros, 5% a mais que jan–ago 2025".
 */
export function fraseMesmoPeriodo(r: Pick<Relatorio, 'year' | 'complete' | 'same_period' | 'evolution'>): string | null {
  const parcial = !r.complete && r.same_period?.partial_year === r.year;
  let atual: number | undefined;
  let anterior: number | undefined;
  let prefixo: string;
  if (parcial && r.same_period) {
    atual = r.same_period.by_year.find((a) => a.year === r.year)?.total;
    anterior = r.same_period.by_year.find((a) => a.year === r.year - 1)?.total;
    prefixo = intervaloDeMeses(r.same_period.months);
  } else {
    atual = r.evolution.find((a) => a.year === r.year)?.total;
    anterior = r.evolution.find((a) => a.year === r.year - 1 && a.complete)?.total;
    prefixo = '';
  }
  if (atual === undefined || anterior === undefined) return null;
  const rotulo = (ano: number) => (prefixo ? `${prefixo} ${ano}` : String(ano));
  const inicio = `${rotulo(r.year)}: ${numero(atual)} ${atual === 1 ? 'registro' : 'registros'}`;
  if (Math.max(atual, anterior) < MINIMO_PARA_COMPARAR) return `${inicio} (poucos registros para comparar com ${rotulo(r.year - 1)})`;
  if (anterior === 0) return `${inicio}; nenhum em ${rotulo(r.year - 1)}`;
  const variacao = Math.round((100 * (atual - anterior)) / anterior);
  if (variacao === 0) return `${inicio}, o mesmo que ${rotulo(r.year - 1)}`;
  return `${inicio}, ${Math.abs(variacao)}% a ${variacao > 0 ? 'mais' : 'menos'} que ${rotulo(r.year - 1)}`;
}

/** Categorias com quantidade e % do total, da maior para a menor ("<3" vai para o fim). */
export function categoriasDoRelatorio(porCategoria: Relatorio['by_category'], total: number, nomes: Record<string, string>) {
  return Object.entries(porCategoria)
    .filter(([k, v]) => k in nomes && v !== 0)
    .map(([k, v]) => ({ chave: k, nome: nomes[k], quantidade: v, pct: typeof v === 'number' && total > 0 ? (100 * v) / total : null }))
    .sort((a, b) => (typeof b.quantidade === 'number' ? b.quantidade : 0) - (typeof a.quantidade === 'number' ? a.quantidade : 0));
}
