/** Telefones úteis em São Paulo. Todos são gratuitos e funcionam de qualquer telefone, mesmo sem crédito. */
export interface Contato {
  numero: string;
  nome: string;
  descricao: string;
}

export interface GrupoContatos {
  titulo: string;
  contatos: Contato[];
}

export const GRUPOS_CONTATOS: GrupoContatos[] = [
  {
    titulo: 'Emergência',
    contatos: [
      { numero: '190', nome: 'Polícia Militar', descricao: 'Crime acontecendo agora, risco à vida ou à segurança.' },
      { numero: '192', nome: 'SAMU', descricao: 'Urgência médica: acidente, mal súbito, socorro.' },
      { numero: '193', nome: 'Corpo de Bombeiros', descricao: 'Incêndio, resgate, salvamento e acidentes.' },
    ],
  },
  {
    titulo: 'Polícia e segurança',
    contatos: [
      { numero: '197', nome: 'Polícia Civil', descricao: 'Informações e atendimento da Polícia Civil.' },
      { numero: '181', nome: 'Disque-Denúncia', descricao: 'Denúncia anônima de crimes no estado de São Paulo.' },
      { numero: '153', nome: 'Guarda Civil Metropolitana', descricao: 'Segurança municipal, praças, escolas e patrimônio da cidade.' },
      { numero: '191', nome: 'Polícia Rodoviária Federal', descricao: 'Ocorrências em rodovias federais.' },
    ],
  },
  {
    titulo: 'Proteção e direitos',
    contatos: [
      { numero: '180', nome: 'Central de Atendimento à Mulher', descricao: 'Violência contra a mulher. Funciona 24 horas.' },
      { numero: '100', nome: 'Disque Direitos Humanos', descricao: 'Violência contra crianças, idosos, pessoas com deficiência e outros grupos.' },
      { numero: '188', nome: 'CVV', descricao: 'Apoio emocional e prevenção do suicídio. Funciona 24 horas.' },
    ],
  },
  {
    titulo: 'Cidade',
    contatos: [
      { numero: '199', nome: 'Defesa Civil', descricao: 'Enchentes, deslizamentos e risco de desabamento.' },
      { numero: '156', nome: 'Prefeitura de São Paulo', descricao: 'Serviços municipais: iluminação, buracos, lixo e outros.' },
    ],
  },
];

/** Registro de boletim de ocorrência pela internet (furtos, perda de documentos e outros casos sem violência). */
export const DELEGACIA_ELETRONICA = 'https://www.delegaciaeletronica.policiacivil.sp.gov.br';
