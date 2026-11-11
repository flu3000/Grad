import { supabase } from './supabase';
import { ErroRelatorio, validarRelatorio, type Relatorio } from './relatorioDados';

export * from './relatorioDados';

/** Raio do relatório: 500 m em volta do endereço (o banco soma os hexágonos res 9 que tocam o círculo). */
export const RAIO_RELATORIO_M = 500;

/**
 * Relatório de um endereço (address_report). Só as coordenadas vão para o banco; o texto do endereço fica no aparelho.
 * `ano` null = ano padrão do banco (o completo mais recente).
 */
export async function buscarRelatorio(lat: number, lng: number, ano: number | null, signal?: AbortSignal): Promise<Relatorio> {
  let query = supabase.rpc('address_report', { lat, lng, radius_m: RAIO_RELATORIO_M, p_year: ano });
  if (signal) query = query.abortSignal(signal);
  const { data, error } = await query;
  if (error) throw new ErroRelatorio('Não foi possível carregar o relatório. Confira a conexão.', 'rede');
  return validarRelatorio(data);
}
