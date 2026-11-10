import type { Contagens } from './mapa';

/** Nomes das categorias de crime gravadas em hex_cells.counts (ver scripts/src/config/crimeWeights.ts). */
export const NOME_CATEGORIA: Record<string, string> = {
  latrocinio: 'Latrocínio',
  homicidio_doloso: 'Homicídio doloso',
  estupro: 'Estupro',
  extorsao_sequestro: 'Extorsão mediante sequestro',
  lesao_seguida_morte: 'Lesão corporal seguida de morte',
  roubo_veiculo: 'Roubo de veículo',
  roubo_carga: 'Roubo de carga',
  roubo_outros: 'Roubo',
  lesao_dolosa: 'Lesão corporal dolosa',
  furto_veiculo: 'Furto de veículo',
  furto_outros: 'Furto',
  porte_arma: 'Porte ou posse de arma',
  trafico: 'Tráfico de drogas',
  culposo: 'Lesão/homicídio culposo (trânsito)',
  outros: 'Outros',
};

/** Categorias com BO no hexágono, da mais frequente para a menos (sem as não criminais). */
export function categoriasOrdenadas(c: Contagens | null): { nome: string; quantidade: number }[] {
  if (!c) return [];
  return Object.entries(c)
    .filter(([k, v]) => typeof v === 'number' && v > 0 && k in NOME_CATEGORIA)
    .map(([k, v]) => ({ nome: NOME_CATEGORIA[k], quantidade: v as number }))
    .sort((a, b) => b.quantidade - a.quantidade);
}
