import colors from './colors';

export type Nivel = 1 | 2 | 3 | 4 | 5;

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
export const corDoNivel = (n: Nivel) => colors.safetyLevels[chave(n)];
export const preenchimentoDoNivel = (n: Nivel) => colors.safetyFills[chave(n)];
