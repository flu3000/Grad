import { normalizeText, type CrimeCategory } from '../config/crimeWeights';

/**
 * Diagnóstico dos BOs sem coordenada (só relatório, não entra na nota). Responde se dá para
 * aproveitá-los distribuindo o peso pelo distrito: quantos são da capital, de que tipo, se o
 * BAIRRO casa com o nome de um distrito e em que tipo de local aconteceram.
 */
const CAPITAL = /^(S\.? ?PAULO|SAO PAULO)$/;

type Contagem = Map<string, number>;
const inc = (m: Contagem, k: string) => m.set(k, (m.get(k) ?? 0) + 1);
const top = (m: Contagem, n: number) => [...m].sort((a, b) => b[1] - a[1]).slice(0, n);

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

  registrar(category: CrimeCategory, cidade: string, bairro: string, tipoLocal: string) {
    const c = normalizeText(cidade);
    inc(this.porCidade, c || '(vazio)');
    if (this.colunaCidade && !CAPITAL.test(c)) return;
    this.totalCapital++;
    inc(this.capitalPorCategoria, category);
    const b = normalizeText(bairro);
    const casa = this.nomesDistritos.has(b);
    const r = (this.bairroCasaComDistrito[category] ??= { sim: 0, nao: 0 });
    casa ? r.sim++ : r.nao++;
    if (category === 'estupro') {
      inc(this.tipoLocalEstupro, normalizeText(tipoLocal) || '(vazio)');
      if (!casa) inc(this.bairrosSemDistrito, b || '(vazio)');
    }
  }

  resumo() {
    return {
      colunaDeCidade: this.colunaCidade ?? null,
      cidadesMaisFrequentes: top(this.porCidade, 10),
      daCapital: this.totalCapital,
      daCapitalPorCategoria: Object.fromEntries(top(this.capitalPorCategoria, 50)),
      bairroCasaComNomeDeDistrito: this.bairroCasaComDistrito,
      estupro_tipoDeLocal: top(this.tipoLocalEstupro, 15),
      estupro_bairrosQueNaoCasam_top30: top(this.bairrosSemDistrito, 30),
    };
  }
}
