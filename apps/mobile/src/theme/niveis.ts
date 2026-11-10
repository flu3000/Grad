import { temaEscuro } from './colors';

export type Nivel = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;
export type Intensidade = 'suave' | 'normal';

export const NIVEIS: Nivel[] = [1, 2, 3, 4, 5, 6, 7, 8];

/**
 * Rótulo e explicação de cada nível. A escala compara os lugares com ocorrências da cidade de São Paulo; os cortes
 * são os percentis 15, 30, 45, 60, 75, 87 e 95 (faixas mais estreitas no topo). Ver a migration escala_de_8_niveis.
 */
export const NIVEL_INFO: Record<Nivel, { rotulo: string; descricao: string }> = {
  1: { rotulo: 'Poucos registros', descricao: 'Pouca ou nenhuma ocorrência registrada com localização.' },
  2: { rotulo: 'Muito baixo', descricao: 'Mais perigoso que 15% dos lugares com ocorrências.' },
  3: { rotulo: 'Baixo', descricao: 'Mais perigoso que 30% dos lugares com ocorrências.' },
  4: { rotulo: 'Moderado', descricao: 'Mais perigoso que 45% dos lugares com ocorrências.' },
  5: { rotulo: 'Elevado', descricao: 'Mais perigoso que 60% dos lugares com ocorrências.' },
  6: { rotulo: 'Alto', descricao: 'Mais perigoso que 75% dos lugares com ocorrências.' },
  7: { rotulo: 'Muito alto', descricao: 'Mais perigoso que 87% dos lugares com ocorrências.' },
  8: { rotulo: 'Crítico', descricao: 'Entre os 5% lugares mais perigosos da cidade.' },
};

const chave = (n: Nivel) => `level${n}` as const;
// As cores dos níveis são iguais nos dois temas.
export const corDoNivel = (n: Nivel) => temaEscuro.safetyLevels[chave(n)];
export const textoSobreNivel = (n: Nivel) => temaEscuro.levelText[chave(n)];

// Opacidade do preenchimento dos hexágonos: cresce com o nível, para o mapa continuar legível.
const ALFA: Record<Nivel, number> = { 1: 0.06, 2: 0.3, 3: 0.34, 4: 0.38, 5: 0.42, 6: 0.46, 7: 0.52, 8: 0.6 };
const FATOR: Record<Intensidade, number> = { suave: 0.6, normal: 1 };

/** Cor de preenchimento do hexágono (#RRGGBBAA) conforme o nível e a intensidade escolhida nas configurações. */
export function preenchimentoDoNivel(n: Nivel, intensidade: Intensidade = 'normal'): string {
  const alfa = ALFA[n] * (FATOR[intensidade] ?? 1);
  return `${corDoNivel(n)}${Math.round(alfa * 255).toString(16).padStart(2, '0')}`;
}
