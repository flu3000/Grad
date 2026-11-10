import { normalizeText, type CrimeCategory } from '../config/crimeWeights';

/**
 * BOs sem coordenada: identifica se são da capital, de que distrito (pelo BAIRRO) e se ocorreram em local
 * público. Usado para distribuir o peso pelos hexágonos do distrito (categorias em
 * DISTRIBUIR_SEM_LOCALIZACAO) e para o diagnóstico do relatório.
 */
const CAPITAL = /^(S\.? ?PAULO|SAO PAULO)$/;

// Locais onde o crime indica perigo para quem circula. Residência, condomínio, hotel etc. ficam de fora.
// Lista por inclusão (conservadora): tipos não listados não contam; o relatório mostra o que ficou de fora.
const LOCAL_PUBLICO =
  /VIA PUBLICA|\bRUA\b|AVENIDA|CALCADA|PRACA|PARQUE|TRANSPORTE|TERMINAL|ESTACAO|METRO|TREM|ONIBUS|PONTO DE ONIBUS|RODOVIA|ESTRADA|VIADUTO|PASSARELA|TUNEL|COMERCIO|COMERCIAL|LOJA|SHOPPING|MERCADO|BAR\b|RESTAURANTE|ESTACIONAMENTO|AREA NAO OCUPADA|TERRENO BALDIO|MATAGAL|LAZER|ESTABELECIMENTO DE ENSINO|ESCOLA|UNIVERSIDADE|REPARTICAO|SAUDE|HOSPITAL|TEMPLO|IGREJA|EVENTO/;

// Abreviações comuns no campo BAIRRO, para casar com o nome oficial do distrito.
const ABREVIACOES: [RegExp, string][] = [
  [/\bVL\b\.?/g, 'VILA'],
  [/\bJD\b\.?|\bJARD\b\.?/g, 'JARDIM'],
  [/\bPQ\b\.?|\bPQUE\b\.?/g, 'PARQUE'],
  [/\bCID\b\.?/g, 'CIDADE'],
  [/\bSTO\b\.?/g, 'SANTO'],
  [/\bSTA\b\.?/g, 'SANTA'],
  [/\bS\b\.?(?= )/g, 'SAO'],
];

export function normalizarBairro(nome: string): string {
  let n = normalizeText(nome).replace(/[`´'’]/g, '');
  for (const [re, sub] of ABREVIACOES) n = n.replace(re, sub);
  return n.replace(/[^A-Z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
}

export const ehLocalPublico = (tipoLocal: string) => LOCAL_PUBLICO.test(normalizeText(tipoLocal));

type Contagem = Map<string, number>;
const inc = (m: Contagem, k: string) => m.set(k, (m.get(k) ?? 0) + 1);
const top = (m: Contagem, n: number) => [...m].sort((a, b) => b[1] - a[1]).slice(0, n);

export interface Classificacao {
  capital: boolean;
  distrito: string | undefined; // nome normalizado do distrito, se o BAIRRO casar
  publico: boolean;
}

export class DiagnosticoSemLocalizacao {
  private colunaCidade: string | undefined;
  private porCidade: Contagem = new Map();
  private capitalPorCategoria: Contagem = new Map();
  private bairroCasaComDistrito: Partial<Record<CrimeCategory, { sim: number; nao: number }>> = {};
  private bairrosSemDistrito: Contagem = new Map();
  private tipoLocalEstupro: Contagem = new Map();
  private totalCapital = 0;

  constructor(private readonly nomesDistritos: Set<string>) {}

  /** Chamar ao achar o cabeçalho de cada aba. */
  usarCabecalho(header: string[]) {
    this.colunaCidade = header.find((h) => h === 'CIDADE') ?? header.find((h) => h.includes('MUNICIPIO') || h.includes('CIDADE'));
  }

  get cidade() {
    return this.colunaCidade;
  }

  registrar(category: CrimeCategory, cidade: string, bairro: string, tipoLocal: string): Classificacao {
    const c = normalizeText(cidade);
    inc(this.porCidade, c || '(vazio)');
    // Sem coluna de cidade não há como saber se o BO é da capital: não aproveita.
    const capital = !!this.colunaCidade && CAPITAL.test(c);
    const publico = ehLocalPublico(tipoLocal);
    if (!capital) return { capital, distrito: undefined, publico };
    this.totalCapital++;
    inc(this.capitalPorCategoria, category);
    const b = normalizarBairro(bairro);
    const distrito = this.nomesDistritos.has(b) ? b : undefined;
    const r = (this.bairroCasaComDistrito[category] ??= { sim: 0, nao: 0 });
    distrito ? r.sim++ : r.nao++;
    if (category === 'estupro') {
      inc(this.tipoLocalEstupro, `${normalizeText(tipoLocal) || '(vazio)'}${publico ? ' [público]' : ''}`);
      if (!distrito) inc(this.bairrosSemDistrito, b || '(vazio)');
    }
    return { capital, distrito, publico };
  }

  resumo() {
    return {
      colunaDeCidade: this.colunaCidade ?? null,
      cidadesMaisFrequentes: top(this.porCidade, 10),
      daCapital: this.totalCapital,
      daCapitalPorCategoria: Object.fromEntries(top(this.capitalPorCategoria, 50)),
      bairroCasaComNomeDeDistrito: this.bairroCasaComDistrito,
      estupro_tipoDeLocal: top(this.tipoLocalEstupro, 25),
      estupro_bairrosQueNaoCasam_top30: top(this.bairrosSemDistrito, 30),
    };
  }
}
