import { normalizeText } from '../config/crimeWeights';
import { cellText } from './valores';

/**
 * Nomes curtos e estáveis das colunas das planilhas da SSP-SP. Os nomes originais mudam entre os anos
 * (ex.: `COD IBGE` em 2026, `CD_IBGE` em 2023/2024; `..._CIRCUNCRIÇÃO` com erro de grafia em 2023/2024),
 * então todo o código usa estes nomes e o mapa de aliases abaixo.
 */
export const ALIASES = {
  departamento: ['NOME_DEPARTAMENTO'],
  seccional: ['NOME_SECCIONAL'],
  delegacia: ['NOME_DELEGACIA'],
  municipio: ['NOME_MUNICIPIO', 'CIDADE', 'MUNICIPIO'],
  num_bo: ['NUM_BO', 'NUMERO_BO', 'NUM_BOLETIM'],
  ano_bo: ['ANO_BO', 'ANO_BOLETIM'],
  data_registro: ['DATA_REGISTRO', 'DATA_COMUNICACAO'],
  data_ocorrencia: ['DATA_OCORRENCIA_BO', 'DATA_OCORRENCIA', 'DATAOCORRENCIA'],
  hora: ['HORA_OCORRENCIA_BO', 'HORA_OCORRENCIA', 'HORAOCORRENCIA'],
  periodo: ['DESC_PERIODO', 'PERIODO_OCORRENCIA', 'PERIDOOCORRENCIA'],
  tipo_local: ['DESCR_TIPOLOCAL', 'DESCRICAOLOCAL'],
  subtipo_local: ['DESCR_SUBTIPOLOCAL'],
  bairro: ['BAIRRO'],
  logradouro: ['LOGRADOURO'],
  numero: ['NUMERO_LOGRADOURO', 'NUMERO'],
  endereco_completo: ['ENDERECO_COMPLETO'],
  lat: ['LATITUDE', 'LAT'],
  lng: ['LONGITUDE', 'LONG', 'LON', 'LNG'],
  precisao: ['PRECISAO'],
  delegacia_circunscricao: ['NOME_DELEGACIA_CIRCUNSCRICAO', 'NOME_DELEGACIA_CIRCUNCRICAO'],
  departamento_circunscricao: ['NOME_DEPARTAMENTO_CIRCUNSCRICAO', 'NOME_DEPARTAMENTO_CIRCUNCRICAO'],
  seccional_circunscricao: ['NOME_SECCIONAL_CIRCUNSCRICAO', 'NOME_SECCIONAL_CIRCUNCRICAO'],
  municipio_circunscricao: ['NOME_MUNICIPIO_CIRCUNSCRICAO', 'NOME_MUNICIPIO_CIRCUNCRICAO'],
  rubrica: ['RUBRICA'],
  conduta: ['DESCR_CONDUTA'],
  natureza: ['NATUREZA_APURADA'],
  mes_estatistica: ['MES_ESTATISTICA'],
  ano_estatistica: ['ANO_ESTATISTICA'],
  cmd: ['CMD'],
  btl: ['BTL'],
  cia: ['CIA'],
  cod_ibge: ['COD_IBGE', 'CD_IBGE', 'CODIGO_IBGE', 'COD_MUNICIPIO_IBGE'],
} as const satisfies Record<string, readonly string[]>;

export type Coluna = keyof typeof ALIASES;
export const COLUNAS = Object.keys(ALIASES) as Coluna[];

/** Colunas sem as quais uma aba não é considerada de dados. */
export const OBRIGATORIAS: Coluna[] = ['lat', 'lng', 'rubrica', 'natureza'];

/** "Nome_Município Circunscrição" → "NOME_MUNICIPIO_CIRCUNSCRICAO". */
export function normalizarNomeColuna(nome: string): string {
  return normalizeText(nome)
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_|_$/g, '');
}

const PARA_COLUNA = new Map<string, Coluna>(COLUNAS.flatMap((c) => ALIASES[c].map((a) => [a, c] as [string, Coluna])));

export interface Cabecalho {
  /** Índice (em `row.values`, que começa em 1) de cada coluna encontrada. */
  indice: Partial<Record<Coluna, number>>;
  /** Nomes originais, na ordem da planilha. */
  originais: string[];
  /** Colunas da planilha que não estão no mapa de aliases. */
  desconhecidas: string[];
  /** Colunas conhecidas que não existem nesta planilha. */
  faltando: Coluna[];
}

export function mapearCabecalho(valores: readonly unknown[]): Cabecalho {
  const indice: Partial<Record<Coluna, number>> = {};
  const originais: string[] = [];
  const desconhecidas: string[] = [];
  valores.forEach((v, i) => {
    const original = cellText(v).trim();
    if (!original) return;
    originais.push(original);
    const coluna = PARA_COLUNA.get(normalizarNomeColuna(original));
    if (coluna && indice[coluna] === undefined) indice[coluna] = i;
    else if (!coluna) desconhecidas.push(original);
  });
  return { indice, originais, desconhecidas, faltando: COLUNAS.filter((c) => indice[c] === undefined) };
}

export const ehCabecalhoDeDados = (c: Cabecalho) => OBRIGATORIAS.every((col) => c.indice[col] !== undefined);
