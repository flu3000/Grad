import { Linking, Platform } from 'react-native';
import type { Region } from 'react-native-maps';
import { Flame, Shield, ShieldCheck, Siren, type LucideIcon } from 'lucide-react-native';
import { limitesDaRegiao } from './mapa';
import { supabase } from './supabase';

export type TipoUnidade = 'policia_militar' | 'policia_civil' | 'gcm' | 'bombeiros';

export interface Unidade {
  id: number;
  tipo: TipoUnidade;
  nome: string;
  endereco: string | null;
  bairro: string | null;
  cep: string | null;
  telefone: string | null;
  distrito: string | null;
  latitude: number;
  longitude: number;
}

/** Nome, ícone e telefone geral de cada força (as unidades da base da Prefeitura não trazem telefone próprio). */
export const INFO_UNIDADE: Record<TipoUnidade, { rotulo: string; icone: LucideIcon; telefone: string; servico: string }> = {
  policia_militar: { rotulo: 'Polícia Militar', icone: Siren, telefone: '190', servico: 'emergência da Polícia Militar' },
  policia_civil: { rotulo: 'Polícia Civil', icone: Shield, telefone: '197', servico: 'Polícia Civil' },
  gcm: { rotulo: 'Guarda Civil Metropolitana', icone: ShieldCheck, telefone: '153', servico: 'Guarda Civil Metropolitana' },
  bombeiros: { rotulo: 'Corpo de Bombeiros', icone: Flame, telefone: '193', servico: 'Corpo de Bombeiros' },
};

export const TIPOS_UNIDADE = Object.keys(INFO_UNIDADE) as TipoUnidade[];

/** Unidades só aparecem com zoom de bairro ou mais próximo, para não poluir o mapa da cidade inteira. */
export const DELTA_MAXIMO_UNIDADES = 0.15;

interface UnidadeRpc {
  id: number;
  kind: TipoUnidade;
  name: string;
  address: string | null;
  neighborhood: string | null;
  postal_code: string | null;
  phone: string | null;
  district_name: string | null;
  lat: number;
  lng: number;
}

export async function buscarUnidades(regiao: Region, signal?: AbortSignal): Promise<Unidade[]> {
  let query = supabase.rpc('security_units_in_view', { ...limitesDaRegiao(regiao), max_units: 400 });
  if (signal) query = query.abortSignal(signal);
  const { data, error } = await query;
  if (error) throw error;
  return ((data ?? []) as UnidadeRpc[]).map((u) => ({
    id: u.id,
    tipo: u.kind,
    nome: u.name,
    endereco: u.address,
    bairro: u.neighborhood,
    cep: u.postal_code,
    telefone: u.phone,
    distrito: u.district_name,
    latitude: u.lat,
    longitude: u.lng,
  }));
}

/** Abre a rota até a unidade no app de mapas do celular. */
export function abrirRota(u: Unidade) {
  const destino = `${u.latitude},${u.longitude}`;
  const url =
    Platform.OS === 'ios'
      ? `http://maps.apple.com/?daddr=${destino}&q=${encodeURIComponent(u.nome)}`
      : `https://www.google.com/maps/dir/?api=1&destination=${destino}`;
  Linking.openURL(url).catch(() => undefined);
}
