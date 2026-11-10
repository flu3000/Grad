const colors = {
  // Cores principais do app
  primary: '#002366',       // Imperial Blue - cabeçalhos, botões principais
  secondary: '#00009C',     // Neon Navy - detalhes, ícones, links
  ternary: '#1E40AF',       // Azul médio para destaques e links

  // Níveis de perigo dos hexágonos (neutro -> amarelo -> vermelho escuro).
  // Nível 1 é neutro de propósito: significa "poucos ou nenhum BO", não "seguro".
  safetyLevels: {
    level1: '#94A3B8',  // Poucos registros - cinza neutro
    level2: '#e0e000',  // Atenção - amarelo
    level3: '#ff5a5a',  // Perigoso leve - vermelho claro
    level4: '#fc1e1e',  // Perigoso médio - vermelho
    level5: '#c80000',  // Perigoso grave - vermelho escuro
  },
  // Preenchimento dos hexágonos no mapa (mesmas cores com transparência, para o mapa continuar legível)
  safetyFills: {
    level1: '#94A3B814',
    level2: '#e0e00047',
    level3: '#ff5a5a59',
    level4: '#fc1e1e66',
    level5: '#c8000080',
  },
  hexStroke: '#FFFFFF26',   // Contorno sutil dos hexágonos

  // Cores neutras / minimalistas
  background: '#1B2738',    // Cinza escuro levemente azulado - fundo principal
  surface: '#1B2738EB',     // Fundo de cards flutuantes sobre o mapa
  card: '#F5F1E6',          // Sand / bege claro - cards, contêineres
  accent: '#3B82F6',        // Azul mais claro - destaques, links sutis
  border: '#334155',        // Cinza azulado - bordas discretas
  textPrimary: '#e7d5a1',   // Texto principal bege
  textSecondary: '#CBD5E1', // Texto secundário cinza-azulado
  danger: '#F87171',        // Mensagens de erro

  // Opcional para sombras ou pequenos efeitos
  shadow: '#00000066',      // Sombra leve transparente
};

export default colors;
