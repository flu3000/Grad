import { supabase } from './supabase';
import { anoDoDataset, ordenarAnos, type Ano, type LinhaDataset } from './anosDados';

export * from './anosDados';

// Cache da sessão: os anos só mudam quando a ingestão grava dados novos.
let cache: Promise<Ano[]> | null = null;

/** Anos disponíveis (tabela datasets), do mais recente para o mais antigo. */
export function buscarAnos(): Promise<Ano[]> {
  if (!cache) {
    cache = (async () => {
      const { data, error } = await supabase
        .from('datasets')
        .select('year, complete, last_complete_month, rows_valid, rows_no_hour, period_factor, hidden_location');
      if (error) throw error;
      const linhas = (data ?? []) as LinhaDataset[];
      if (!linhas.length) throw new Error('Nenhum ano disponível.');
      return ordenarAnos(linhas.map(anoDoDataset));
    })();
    // Se falhar (ex.: sem rede), a próxima chamada tenta de novo.
    cache.catch(() => {
      cache = null;
    });
  }
  return cache;
}
