import { temaEscuro } from './colors';

export type Nivel = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10;
export type Intensidade = 'suave' | 'normal';

export const NIVEIS: Nivel[] = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
export const NIVEL_MAXIMO: Nivel = 10;

/**
 * Rótulo e explicação de cada nível. Cada zoom compara hexágonos do mesmo tamanho: os cortes são os percentis 15, 30,
 * 45, 60, 72, 82, 90, 95 e 98 dos hexágonos com ocorrências daquela resolução (faixas mais estreitas no topo).
 * Ver a migration escala_de_10_niveis_por_resolucao.
 */
export const NIVEL_INFO: Record<Nivel, { rotulo: string; descricao: string }> = {
  1: { rotulo: 'Poucos registros', descricao: 'Pouca ou nenhuma ocorrência registrada com localização.' },
  2: { rotulo: 'Muito baixo', descricao: 'Mais perigoso que 15% das áreas com ocorrências.' },
  3: { rotulo: 'Baixo', descricao: 'Mais perigoso que 30% das áreas com ocorrências.' },
  4: { rotulo: 'Médio-baixo', descricao: 'Mais perigoso que 45% das áreas com ocorrências.' },
  5: { rotulo: 'Médio', descricao: 'Mais perigoso que 60% das áreas com ocorrências.' },
  6: { rotulo: 'Médio-alto', descricao: 'Mais perigoso que 72% das áreas com ocorrências.' },
  7: { rotulo: 'Alto', descricao: 'Mais perigoso que 82% das áreas com ocorrências.' },
  8: { rotulo: 'Muito alto', descricao: 'Mais perigoso que 90% das áreas com ocorrências.' },
  9: { rotulo: 'Grave', descricao: 'Entre os 5% das áreas mais perigosas da cidade.' },
  10: { rotulo: 'Crítico', descricao: 'Entre os 2% das áreas mais perigosas da cidade.' },
};

const chave = (n: Nivel) => `level${n}` as const;
// As cores dos níveis são iguais nos dois temas.
export const corDoNivel = (n: Nivel) => temaEscuro.safetyLevels[chave(n)];
export const textoSobreNivel = (n: Nivel) => temaEscuro.levelText[chave(n)];

// Opacidade do preenchimento dos hexágonos: cresce com o nível, para o mapa continuar legível.
const ALFA: Record<Nivel, number> = { 1: 0.06, 2: 0.28, 3: 0.31, 4: 0.34, 5: 0.37, 6: 0.4, 7: 0.44, 8: 0.48, 9: 0.54, 10: 0.62 };
const FATOR: Record<Intensidade, number> = { suave: 0.6, normal: 1 };

/** Cor de preenchimento do hexágono (#RRGGBBAA) conforme o nível e a intensidade escolhida nas configurações. */
export function preenchimentoDoNivel(n: Nivel, intensidade: Intensidade = 'normal'): string {
  const alfa = ALFA[n] * (FATOR[intensidade] ?? 1);
  return `${corDoNivel(n)}${Math.round(alfa * 255).toString(16).padStart(2, '0')}`;
}
