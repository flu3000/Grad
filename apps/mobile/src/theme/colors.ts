/**
 * Paletas do app. Os dois temas têm exatamente as mesmas chaves (o tipo de `temaClaro` é o de `temaEscuro`).
 * Componentes usam sempre `theme.colors.*` via styled-components, nunca hex solto.
 *
 * Papéis: `background` (fundo das telas), `primary` (blocos e barra de abas), `surface` (cards flutuantes sobre o mapa),
 * `accent`/`onAccent` (botões e itens ativos), `chip` (etiquetas neutras), `emergencia` (só para ações de emergência).
 */

// Iguais nos dois temas.
const comuns = {
  // Níveis de perigo: escala sequencial amarelo → laranja → vermelho (ColorBrewer YlOrRd), com o nível 1 neutro.
  // Nível 1 é neutro de propósito: significa "poucos ou nenhum BO", não "seguro".
  safetyLevels: {
    level1: '#9AA4B1', // Poucos registros
    level2: '#FFFFB2', // Muito baixo
    level3: '#FED976', // Baixo
    level4: '#FEB24C', // Moderado
    level5: '#FD8D3C', // Elevado
    level6: '#FC4E2A', // Alto
    level7: '#E31A1C', // Muito alto
    level8: '#B10026', // Crítico
  },
  // Texto sobre a cor de cada nível (escuro nos tons claros, branco nos vermelhos)
  levelText: {
    level1: '#1C2026',
    level2: '#1C2026',
    level3: '#1C2026',
    level4: '#1C2026',
    level5: '#1C2026',
    level6: '#FFFFFF',
    level7: '#FFFFFF',
    level8: '#FFFFFF',
  },
  // Marcadores das unidades de segurança no mapa
  unidades: {
    policia_militar: '#2F6FEB',
    policia_civil: '#7A5AF8',
    gcm: '#0E9384',
    bombeiros: '#E8590C',
  },
  onUnidade: '#FFFFFF',
  emergencia: '#D92D20',
  onAccent: '#FFFFFF',
  shadow: '#00000066',
};

export const temaEscuro = {
  ...comuns,
  background: '#0F1115', // grafite
  primary: '#181B21', // blocos de conteúdo e barra de abas
  surface: '#181B21F2', // cards sobre o mapa
  card: '#F5F6F8', // botão dos interruptores
  border: '#2A2F37',
  chip: '#232730',
  textPrimary: '#E6E8EB',
  textSecondary: '#9BA3AE',
  accent: '#3D7FE0', // azul sóbrio
  danger: '#F26B6B',
  hexStroke: '#FFFFFF1F', // contorno sutil dos hexágonos
};

export const temaClaro: typeof temaEscuro = {
  ...comuns,
  background: '#F4F5F7',
  primary: '#FFFFFF',
  surface: '#FFFFFFF2',
  card: '#FFFFFF',
  border: '#E2E5E9',
  chip: '#EEF0F3',
  textPrimary: '#1C2026',
  textSecondary: '#5B6573',
  accent: '#2563EB',
  danger: '#D93025',
  hexStroke: '#1C202633',
};

export type Cores = typeof temaEscuro;

export default temaEscuro;
