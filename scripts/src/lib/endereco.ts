import { normalizeText } from '../config/crimeWeights';

/**
 * Normalização de logradouros para casar o texto livre da SSP ("AV. CRUZEIRO DO SUL, 1500 APTO 12") com o CNEFE,
 * que separa tipo (AVENIDA), título (DOUTOR) e nome. Tudo em maiúsculas, sem acento.
 *
 * - `tipo`: RUA, AVENIDA... (abreviações expandidas); null se o texto não começa com um tipo conhecido.
 * - `completo`: título + nome, sem as partículas DO/DA/DE/DOS/DAS e com números por extenso em algarismos.
 * - `chave`: `completo` sem os títulos do começo ("DOUTOR ARNALDO" → "ARNALDO"). É a chave do índice: a SSP às
 *   vezes omite o título que o CNEFE tem, e vice-versa; o `completo` serve para desempatar.
 */

/** Tipo de logradouro: forma escrita → forma do CNEFE. */
const TIPOS: Record<string, string> = {
  R: 'RUA',
  RUA: 'RUA',
  AV: 'AVENIDA',
  AVN: 'AVENIDA',
  AVEN: 'AVENIDA',
  AVENIDA: 'AVENIDA',
  AL: 'ALAMEDA',
  ALAM: 'ALAMEDA',
  ALAMEDA: 'ALAMEDA',
  TV: 'TRAVESSA',
  TRAV: 'TRAVESSA',
  TRAVESSA: 'TRAVESSA',
  PC: 'PRACA',
  PCA: 'PRACA',
  PRACA: 'PRACA',
  EST: 'ESTRADA',
  ESTR: 'ESTRADA',
  ESTRADA: 'ESTRADA',
  VD: 'VIADUTO',
  VIAD: 'VIADUTO',
  VIADUTO: 'VIADUTO',
  LG: 'LARGO',
  LGO: 'LARGO',
  LARGO: 'LARGO',
  PQ: 'PARQUE',
  PQE: 'PARQUE',
  PARQUE: 'PARQUE',
  ROD: 'RODOVIA',
  RODOVIA: 'RODOVIA',
  VE: 'VIELA',
  VIELA: 'VIELA',
  BC: 'BECO',
  BECO: 'BECO',
  PSG: 'PASSAGEM',
  PASSAGEM: 'PASSAGEM',
  ESC: 'ESCADARIA',
  ESCADARIA: 'ESCADARIA',
  VIA: 'VIA',
  ACESSO: 'ACESSO',
  LADEIRA: 'LADEIRA',
  PASSARELA: 'PASSARELA',
  CAMINHO: 'CAMINHO',
};

/** Abreviações de título → forma do CNEFE (NOM_TITULO_SEGLOGR). */
const ABREV_TITULOS: Record<string, string> = {
  DR: 'DOUTOR',
  DRA: 'DOUTORA',
  PROF: 'PROFESSOR',
  PROFA: 'PROFESSORA',
  CEL: 'CORONEL',
  GAL: 'GENERAL',
  GEN: 'GENERAL',
  STA: 'SANTA',
  STO: 'SANTO',
  S: 'SAO',
  PE: 'PADRE',
  ENG: 'ENGENHEIRO',
  ENGO: 'ENGENHEIRO',
  MAL: 'MARECHAL',
  CAP: 'CAPITAO',
  TEN: 'TENENTE',
  SGT: 'SARGENTO',
  BRIG: 'BRIGADEIRO',
  DES: 'DESEMBARGADOR',
  CONS: 'CONSELHEIRO',
  CONSELH: 'CONSELHEIRO',
  PRES: 'PRESIDENTE',
  SEN: 'SENADOR',
  DEP: 'DEPUTADO',
  VER: 'VEREADOR',
  MONS: 'MONSENHOR',
  COMEND: 'COMENDADOR',
  MIN: 'MINISTRO',
  MAJ: 'MAJOR',
  ALM: 'ALMIRANTE',
  VISC: 'VISCONDE',
  SRA: 'SENHORA',
  NSA: 'NOSSA',
  NS: 'NOSSA',
};

/** Títulos que saem da chave quando estão no começo (os mais comuns no CNEFE de São Paulo). */
const TITULOS = new Set(
  'DOUTOR DOUTORA PROFESSOR PROFESSORA SAO SANTA SANTO PADRE CORONEL ENGENHEIRO BARAO BARONESA DOM DONA GENERAL CONSELHEIRO FREI CAPITAO MINISTRO BRIGADEIRO DESEMBARGADOR VISCONDE VISCONDESSA MAJOR SENADOR MARECHAL TENENTE COMENDADOR CONEGO DEPUTADO MARQUES MARQUESA ALMIRANTE CONDE CONDESSA SARGENTO PRESIDENTE MAESTRO SOLDADO MONSENHOR CABO COMANDANTE VEREADOR AGRIMENSOR IRMA IRMAO MADRE DUQUE REVERENDO EMBAIXADOR CARDEAL ARQUITETO APOSTOLO PRINCESA PRINCIPE PASTOR VIGARIO JORNALISTA IMPERATRIZ IMPERADOR GOVERNADOR RAINHA REI PAPA ARCEBISPO BISPO DELEGADO JUIZ PREFEITO REGENTE ENFERMEIRA ESCRITOR POETA CANTOR ATOR MESTRE'.split(
    ' ',
  ),
);
/** Títulos de duas palavras (comparados antes dos de uma). */
const TITULOS_DUPLOS = ['NOSSA SENHORA'];

const PARTICULAS = new Set(['DO', 'DA', 'DE', 'DOS', 'DAS', 'D']);

/** Marcadores de complemento: daqui em diante não é mais o nome do logradouro. */
const COMPLEMENTOS = new Set([
  'APTO',
  'APT',
  'AP',
  'APART',
  'APARTAMENTO',
  'BLOCO',
  'BL',
  'LOJA',
  'LJ',
  'FUNDOS',
  'FDS',
  'FD',
  'ESQ',
  'ESQUINA',
  'CASA',
  'SALA',
  'SL',
  'CJ',
  'CONJ',
  'NUMERO',
  'NUM',
  'KM',
  'SN',
  'LOTE',
  'LT',
  'QUADRA',
  'QD',
  'TERREO',
  'ANDAR',
  'BOX',
  'ALTURA',
  'PROXIMO',
  'DEFRONTE',
  'OPOSTO',
  'SENTIDO',
  'PISTA',
]);

const UNIDADES: Record<string, number> = {
  UM: 1,
  UMA: 1,
  DOIS: 2,
  DUAS: 2,
  TRES: 3,
  QUATRO: 4,
  CINCO: 5,
  SEIS: 6,
  SETE: 7,
  OITO: 8,
  NOVE: 9,
  DEZ: 10,
  ONZE: 11,
  DOZE: 12,
  TREZE: 13,
  QUATORZE: 14,
  CATORZE: 14,
  QUINZE: 15,
  DEZESSEIS: 16,
  DEZESSETE: 17,
  DEZOITO: 18,
  DEZENOVE: 19,
  VINTE: 20,
  TRINTA: 30,
  QUARENTA: 40,
  CINQUENTA: 50,
  SESSENTA: 60,
  SETENTA: 70,
  OITENTA: 80,
  NOVENTA: 90,
  CEM: 100,
  CENTO: 100,
  DUZENTOS: 200,
  TREZENTOS: 300,
  QUATROCENTOS: 400,
  QUINHENTOS: 500,
  SEISCENTOS: 600,
  SETECENTOS: 700,
  OITOCENTOS: 800,
  NOVECENTOS: 900,
  MIL: 1000,
  PRIMEIRO: 1,
  PRIMEIRA: 1,
  SEGUNDO: 2,
  SEGUNDA: 2,
  TERCEIRO: 3,
  TERCEIRA: 3,
};

/** Números por extenso → algarismos ("VINTE E CINCO" → "25", "MIL NOVECENTOS E TRINTA E DOIS" → "1932"). */
export function numerosPorExtenso(tokens: string[]): string[] {
  const out: string[] = [];
  for (let i = 0; i < tokens.length; i++) {
    if (!(tokens[i] in UNIDADES)) {
      out.push(tokens[i]);
      continue;
    }
    let total = 0;
    let grupo = 0;
    let j = i;
    while (j < tokens.length && tokens[j] in UNIDADES) {
      const v = UNIDADES[tokens[j]];
      if (v === 1000) (total += (grupo || 1) * 1000), (grupo = 0);
      else grupo += v;
      // "E" entre dois números faz parte do número
      if (tokens[j + 1] === 'E' && tokens[j + 2] in UNIDADES) j += 2;
      else j++;
    }
    out.push(String(total + grupo));
    i = j - 1;
  }
  return out;
}

/** Texto → tokens alfanuméricos (sem acento, ordinal "1º" → "1", hífen e pontuação viram espaço). */
export function tokens(texto: string): string[] {
  return normalizeText(texto)
    .replace(/(\d)\s*[ºª°]/g, '$1')
    .replace(/[ºª°]/g, ' ')
    .replace(/(\d)(O|A)\b/g, '$1') // "1O" (º sem o símbolo)
    .replace(/[`´'’]/g, '')
    .replace(/[^A-Z0-9]+/g, ' ')
    .trim()
    .split(' ')
    .filter(Boolean);
}

export interface NomeNormalizado {
  completo: string;
  chave: string;
}

/** Título + nome (sem o tipo) → forma normalizada. */
export function normalizarNome(toks: string[]): NomeNormalizado {
  let t = numerosPorExtenso(toks.map((x) => ABREV_TITULOS[x] ?? x));
  // "N SRA" / "NSA SRA" / "NOSSA SRA" → NOSSA SENHORA (o N sozinho só vale antes de SENHORA)
  t = t.map((x, i) => (x === 'N' && t[i + 1] === 'SENHORA' ? 'NOSSA' : x));
  t = t.filter((x) => !PARTICULAS.has(x));
  if (!t.length) return { completo: '', chave: '' };
  const completo = t.join(' ');
  let i = 0;
  for (;;) {
    const duplo = TITULOS_DUPLOS.find((d) => t.slice(i, i + 2).join(' ') === d);
    if (duplo && t.length - i > 2) i += 2;
    else if (TITULOS.has(t[i]) && t.length - i > 1) i++;
    else break;
  }
  return { completo, chave: t.slice(i).join(' ') };
}

export const normalizarTipo = (tipo: string): string => {
  const t = tokens(tipo).join(' ');
  return TIPOS[t] ?? t;
};

export interface LogradouroSsp extends NomeNormalizado {
  tipo: string | null;
  /** Número escrito no próprio logradouro ("AV PAULISTA, 2100"); null se não houver. */
  numero: number | null;
  /** "S/N" escrito no logradouro. */
  semNumero: boolean;
}

/** Texto livre da SSP → tipo, nome normalizado e número embutido. */
export function analisarLogradouro(texto: string): LogradouroSsp {
  let s = normalizeText(texto).replace(/\([^)]*\)?/g, ' '); // parênteses: "(BR 116)"
  let semNumero = /\bS\s*\/\s*N[ºO°]?\b|\bSN\b/.test(s);
  s = s.replace(/\bS\s*\/\s*N[ºO°]?\b/g, ' ');
  // " - " separa o nome de um complemento ("AVENIDA ARICANDUVA - PISTA CENTRAL")
  s = s.split(/\s-\s|\s–\s/)[0];
  let numero: number | null = null;
  // Depois da vírgula: número ou complemento.
  const virgula = s.indexOf(',');
  if (virgula >= 0) {
    const m = s.slice(virgula + 1).match(/^\s*(?:N[º°.]?\s*)?(\d{1,6})/);
    if (m) numero = Number(m[1]);
    s = s.slice(0, virgula);
  }
  // "Nº 123" / "N. 123" no meio do texto
  const nro = s.match(/\s(?:N[º°]|N\.|NO\.?|NUMERO)\s*(\d{1,6})\b/);
  if (nro) {
    numero ??= Number(nro[1]);
    s = s.slice(0, nro.index);
  }
  let t = tokens(s);
  let tipo: string | null = null;
  if (t.length > 1 && TIPOS[t[0]]) {
    tipo = TIPOS[t[0]];
    t = t.slice(1);
  }
  // Complemento só depois de pelo menos uma palavra do nome ("RUA CASA VERDE" é nome).
  const corte = t.findIndex((x, i) => i > 0 && COMPLEMENTOS.has(x));
  if (corte > 0) {
    if (t[corte] === 'SN') semNumero = true;
    t = t.slice(0, corte);
  }
  const nome = normalizarNome(t);
  return { tipo, ...nome, numero: numero && numero > 0 ? numero : null, semNumero };
}

// ---------------------------------------------------------------------------------- distância de edição

/** Distância de Levenshtein com limite (devolve limite + 1 se passar). */
export function distanciaEdicao(a: string, b: string, limite: number): number {
  if (Math.abs(a.length - b.length) > limite) return limite + 1;
  let ant = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const atual = [i];
    let menor = i;
    for (let j = 1; j <= b.length; j++) {
      const v = Math.min(ant[j] + 1, atual[j - 1] + 1, ant[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      atual.push(v);
      if (v < menor) menor = v;
    }
    if (menor > limite) return limite + 1;
    ant = atual;
  }
  return ant[b.length];
}

/** Variantes com uma letra a menos (SymSpell, distância 1), para achar candidatos do fuzzy sem comparar todos. */
export function delecoes(s: string): string[] {
  const out = new Set<string>([s]);
  for (let i = 0; i < s.length; i++) out.add(s.slice(0, i) + s.slice(i + 1));
  return [...out];
}

/** Distância em metros (equiretangular; precisa o bastante dentro da cidade). */
export function distanciaM(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const k = Math.PI / 180;
  const x = (lng2 - lng1) * k * Math.cos(((lat1 + lat2) / 2) * k);
  const y = (lat2 - lat1) * k;
  return Math.sqrt(x * x + y * y) * 6_371_000;
}
