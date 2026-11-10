import type { Region } from 'react-native-maps';
import { supabase } from './supabase';
import type { Nivel } from '../theme/niveis';

export type Resolucao = 7 | 8 | 9;

export interface Hexagono {
  h3: string;
  nivel: Nivel;
  score: number;
  coordenadas: { latitude: number; longitude: number }[];
}

export interface Contagens {
  total: number;
  peso: number;
  [categoria: string]: number | Record<string, number>;
}

export interface LocalInfo {
  distrito: string | null;
  subprefeitura: string | null;
  h3: string | null;
  nivel: Nivel | null;
  score: number | null;
  contagens: Contagens | null;
}

/** Área aproximada de um hexágono H3 em cada resolução usada pelo app. */
export const AREA_HEXAGONO: Record<Resolucao, string> = { 7: '5,2 km²', 8: '0,74 km²', 9: '0,11 km²' };

/** Centro aproximado de um hexágono (média dos vértices; os hexágonos são pequenos). */
export function centroDoHexagono(h: Hexagono) {
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
}

export async function buscarHexagonos(regiao: Region, signal?: AbortSignal): Promise<{ res: Resolucao; hexagonos: Hexagono[] }> {
  const res = resolucaoParaZoom(regiao.latitudeDelta);
  let query = supabase.rpc('hexagons_in_view', { ...limitesDaRegiao(regiao), res, max_cells: 2000 });
  if (signal) query = query.abortSignal(signal);
  const { data, error } = await query;
  if (error) throw error;
  const hexagonos = ((data ?? []) as HexagonoRpc[]).map((h) => ({
    h3: h.h3_index,
    nivel: h.level as Nivel,
    score: h.score,
    // GeoJSON é [lng, lat] e repete o primeiro ponto no fim; o <Polygon> não precisa dele.
    coordenadas: h.geometry.coordinates[0].slice(0, -1).map(([longitude, latitude]) => ({ latitude, longitude })),
  }));
  return { res, hexagonos };
}

interface LocalRpc {
  district_name: string | null;
  subprefecture_name: string | null;
  h3_index: string | null;
  level: number | null;
  score: number | null;
  counts: Contagens | null;
}

export async function localizarPonto(lat: number, lng: number, res: Resolucao = 8): Promise<LocalInfo> {
  const { data, error } = await supabase.rpc('locate_point', { lat, lng, res });
  if (error) throw error;
  const r = ((data ?? []) as LocalRpc[])[0];
  return {
    distrito: r?.district_name ?? null,
    subprefeitura: r?.subprefecture_name ?? null,
    h3: r?.h3_index ?? null,
    nivel: (r?.level ?? null) as Nivel | null,
    score: r?.score ?? null,
    contagens: r?.counts ?? null,
  };
}
