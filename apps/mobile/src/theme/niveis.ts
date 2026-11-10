import { temaEscuro } from './colors';

export type Nivel = 1 | 2 | 3 | 4 | 5;
export type Intensidade = 'suave' | 'normal' | 'forte';

export const NIVEIS: Nivel[] = [1, 2, 3, 4, 5];

/** Rótulo e explicação curta de cada nível de perigo (escala relativa à cidade de São Paulo). */
export const NIVEL_INFO: Record<Nivel, { rotulo: string; descricao: string }> = {
  1: { rotulo: 'Poucos registros', descricao: 'Pouca ou nenhuma ocorrência registrada com localização.' },
  2: { rotulo: 'Baixo', descricao: 'Entre os 20% menos perigosos dos lugares com ocorrências.' },
  3: { rotulo: 'Moderado', descricao: 'Perigo intermediário em relação ao resto da cidade.' },
  4: { rotulo: 'Alto', descricao: 'Entre os 40% mais perigosos dos lugares com ocorrências.' },
  5: { rotulo: 'Muito alto', descricao: 'Entre os 20% mais perigosos dos lugares com ocorrências.' },
};

const chave = (n: Nivel) => `level${n}` as const;
// As cores dos níveis são iguais nos dois temas.
export const corDoNivel = (n: Nivel) => temaEscuro.safetyLevels[chave(n)];
export const textoSobreNivel = (n: Nivel) => temaEscuro.levelText[chave(n)];

// Opacidade do preenchimento dos hexágonos: cresce com o nível, para o mapa continuar legível.
const ALFA: Record<Nivel, number> = { 1: 0.08, 2: 0.28, 3: 0.35, 4: 0.4, 5: 0.5 };
const FATOR: Record<Intensidade, number> = { suave: 0.6, normal: 1, forte: 1.5 };

/** Cor de preenchimento do hexágono (#RRGGBBAA) conforme o nível e a intensidade escolhida nas configurações. */
export function preenchimentoDoNivel(n: Nivel, intensidade: Intensidade = 'normal'): string {
  const alfa = Math.min(ALFA[n] * FATOR[intensidade], 0.85);
  return `${corDoNivel(n)}${Math.round(alfa * 255).toString(16).padStart(2, '0')}`;
}
