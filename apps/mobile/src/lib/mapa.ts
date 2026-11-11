import type { Region } from 'react-native-maps';
import { supabase } from './supabase';
import type { Nivel } from '../theme/niveis';

export type Resolucao = 7 | 8 | 9;

export interface Hexagono {
  h3: string;
  nivel: Nivel;
  score: number;
  coordenadas: { latitude: number; longitude: number }[];
  /** nível em cada período (madrugada, manhã, tarde, noite); só quando pedido com `comPeriodos` */
  niveisPorPeriodo: Nivel[] | null;
  /** nível em cada hora (janela de 3 h centrada); só quando pedido com `comHoras` */
  niveisPorHora: Nivel[] | null;
}

export interface Contagens {
  total: number;
  peso: number;
  [categoria: string]: number | Record<string, unknown>;
}

export interface LocalInfo {
  distrito: string | null;
  subprefeitura: string | null;
  h3: string | null;
  nivel: Nivel | null;
  score: number | null;
  contagens: Contagens | null;
  /** ano consultado (o banco responde com o ano padrão quando não se pede um) */
  ano: number | null;
  niveisPorPeriodo: (Nivel | null)[] | null;
  totalPorPeriodo: number[] | null;
  niveisPorHora: (Nivel | null)[] | null;
}

/** Área aproximada de um hexágono H3 em cada resolução usada pelo app. */
export const AREA_HEXAGONO: Record<Resolucao, string> = { 7: '5,2 km²', 8: '0,74 km²', 9: '0,11 km²' };

/** Centro aproximado de um hexágono (média dos vértices; os hexágonos são pequenos). */
export function centroDoHexagono(h: Pick<Hexagono, 'coordenadas'>) {
  const n = h.coordenadas.length;
  return {
    latitude: h.coordenadas.reduce((s, c) => s + c.latitude, 0) / n,
    longitude: h.coordenadas.reduce((s, c) => s + c.longitude, 0) / n,
  };
}

/** Resolução H3 conforme o zoom (latitudeDelta da região visível). Ver docs/SUPABASE.md. */
export function resolucaoParaZoom(latitudeDelta: number): Resolucao {
  if (latitudeDelta > 0.15) return 7;
  if (latitudeDelta > 0.04) return 8;
  return 9;
}

/** Limites do retângulo visível, com uma pequena margem para não aparecer borda vazia ao arrastar. */
export function limitesDaRegiao(r: Region, margem = 0.1) {
  const dLat = (r.latitudeDelta / 2) * (1 + margem);
  const dLng = (r.longitudeDelta / 2) * (1 + margem);
  return {
    min_lng: r.longitude - dLng,
    min_lat: r.latitude - dLat,
    max_lng: r.longitude + dLng,
    max_lat: r.latitude + dLat,
  };
}

interface HexagonoRpc {
  h3_index: string;
  level: number;
  score: number;
  geometry: { type: 'Polygon'; coordinates: number[][][] };
  levels_by_period?: number[] | null;
  levels_by_hour?: number[] | null;
}

export interface OpcoesHexagonos {
  /** null = ano padrão do banco */
  ano: number | null;
  comPeriodos?: boolean;
  comHoras?: boolean;
}

const MAX_CELULAS = 2000;

// Cache por (ano, resolução, região), limitado às regiões mais recentes para a memória não crescer durante o uso.
// Uma região guardada com períodos/horas também serve para um filtro mais simples.
export const CACHE_MAXIMO = 20;
interface ItemCache {
  hexagonos: Hexagono[];
  comPeriodos: boolean;
  comHoras: boolean;
}
const cache = new Map<string, ItemCache>();
const chaveCache = (regiao: Region, res: Resolucao, ano: number | null) => {
  const l = limitesDaRegiao(regiao);
  const r = (x: number) => x.toFixed(3);
  return [ano ?? 'padrao', res, r(l.min_lng), r(l.min_lat), r(l.max_lng), r(l.max_lat)].join('|');
};

export async function buscarHexagonos(
  regiao: Region,
  opcoes: OpcoesHexagonos,
  signal?: AbortSignal,
): Promise<{ res: Resolucao; hexagonos: Hexagono[] }> {
  const res = resolucaoParaZoom(regiao.latitudeDelta);
  const chave = chaveCache(regiao, res, opcoes.ano);
  const guardado = cache.get(chave);
  if (guardado && (!opcoes.comPeriodos || guardado.comPeriodos) && (!opcoes.comHoras || guardado.comHoras)) {
    cache.delete(chave);
    cache.set(chave, guardado); // mais recente no fim
    return { res, hexagonos: guardado.hexagonos };
  }
  let query = supabase.rpc('hexagons_in_view', {
    ...limitesDaRegiao(regiao),
    res,
    max_cells: MAX_CELULAS,
    p_year: opcoes.ano,
    with_periods: !!opcoes.comPeriodos,
    with_hours: !!opcoes.comHoras,
  });
  if (signal) query = query.abortSignal(signal);
  const { data, error } = await query;
  if (error) throw error;
  const hexagonos = ((data ?? []) as HexagonoRpc[]).map((h) => ({
    h3: h.h3_index,
    nivel: h.level as Nivel,
    score: h.score,
    // GeoJSON é [lng, lat] e repete o primeiro ponto no fim; o <Polygon> não precisa dele.
    coordenadas: h.geometry.coordinates[0].slice(0, -1).map(([longitude, latitude]) => ({ latitude, longitude })),
    niveisPorPeriodo: (h.levels_by_period ?? null) as Nivel[] | null,
    niveisPorHora: (h.levels_by_hour ?? null) as Nivel[] | null,
  }));
  cache.delete(chave);
  cache.set(chave, { hexagonos, comPeriodos: !!opcoes.comPeriodos, comHoras: !!opcoes.comHoras });
  while (cache.size > CACHE_MAXIMO) cache.delete(cache.keys().next().value as string);
  return { res, hexagonos };
}

interface LocalRpc {
  district_name: string | null;
  subprefecture_name: string | null;
  h3_index: string | null;
  level: number | null;
  score: number | null;
  counts: Contagens | null;
  year?: number | null;
  levels_by_period?: (number | null)[] | null;
  total_by_period?: number[] | null;
  levels_by_hour?: (number | null)[] | null;
}

export async function localizarPonto(
  lat: number,
  lng: number,
  res: Resolucao = 8,
  ano: number | null = null,
  signal?: AbortSignal,
): Promise<LocalInfo> {
  let query = supabase.rpc('locate_point', { lat, lng, res, p_year: ano });
  if (signal) query = query.abortSignal(signal);
  const { data, error } = await query;
  if (error) throw error;
  const r = ((data ?? []) as LocalRpc[])[0];
  return {
    distrito: r?.district_name ?? null,
    subprefeitura: r?.subprefecture_name ?? null,
    h3: r?.h3_index ?? null,
    nivel: (r?.level ?? null) as Nivel | null,
    score: r?.score ?? null,
    contagens: r?.counts ?? null,
    ano: r?.year ?? ano,
    niveisPorPeriodo: (r?.levels_by_period ?? null) as (Nivel | null)[] | null,
    totalPorPeriodo: r?.total_by_period ?? null,
    niveisPorHora: (r?.levels_by_hour ?? null) as (Nivel | null)[] | null,
  };
}
