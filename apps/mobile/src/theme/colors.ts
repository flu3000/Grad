/**
 * Paletas do app. Os dois temas têm exatamente as mesmas chaves (o tipo de `temaClaro` é o de `temaEscuro`).
 * Componentes usam sempre `theme.colors.*` via styled-components, nunca hex solto.
 */

// Iguais nos dois temas: níveis de perigo (neutro → amarelo → vermelho escuro) e unidades de segurança.
const comuns = {
  // Nível 1 é neutro de propósito: significa "poucos ou nenhum BO", não "seguro".
  safetyLevels: {
    level1: '#94A3B8', // Poucos registros - cinza neutro
    level2: '#e0e000', // Atenção - amarelo
    level3: '#ff5a5a', // Perigoso leve - vermelho claro
    level4: '#fc1e1e', // Perigoso médio - vermelho
    level5: '#c80000', // Perigoso grave - vermelho escuro
  },
  // Texto sobre a cor de cada nível (escuro nos tons claros, branco nos vermelhos)
  levelText: {
    level1: '#1B2738',
    level2: '#1B2738',
    level3: '#FFFFFF',
    level4: '#FFFFFF',
    level5: '#FFFFFF',
  },
  // Marcadores das unidades de segurança no mapa
  unidades: {
    policia_militar: '#2563EB',
    policia_civil: '#7C3AED',
    gcm: '#0D9488',
    bombeiros: '#EA580C',
  },
  onUnidade: '#FFFFFF',
  shadow: '#00000066',
};

export const temaEscuro = {
  ...comuns,
  primary: '#002366', // Imperial Blue - barra de abas, blocos de conteúdo
  secondary: '#00009C',
  ternary: '#1E40AF',
  background: '#1B2738', // Fundo principal
  surface: '#1B2738EB', // Cards flutuantes sobre o mapa
  card: '#F5F1E6',
  accent: '#3B82F6',
  border: '#334155',
  textPrimary: '#e7d5a1', // Texto principal bege
  textSecondary: '#CBD5E1',
  danger: '#F87171',
  hexStroke: '#FFFFFF26', // Contorno sutil dos hexágonos
};

export const temaClaro: typeof temaEscuro = {
  ...comuns,
  primary: '#FFFFFF',
  secondary: '#00009C',
  ternary: '#1E40AF',
  background: '#EEF1F6',
  surface: '#FFFFFFF2',
  card: '#FFFFFF',
  accent: '#2563EB',
  border: '#CBD5E1',
  textPrimary: '#0F1E3D', // Azul quase preto
  textSecondary: '#475569',
  danger: '#DC2626',
  hexStroke: '#0F172A33',
};

export type Cores = typeof temaEscuro;

export default temaEscuro;
