import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import { analisarLogradouro, delecoes, distanciaEdicao, distanciaM } from './endereco';
import type { Dica } from '../config/geocodificacao';
import { ENDERECOS_CONHECIDOS, type EnderecoConhecido } from '../config/enderecosConhecidos';
import { dataDir } from './paths';
import { normalizarBairro } from './semLocalizacao';

/**
 * Geocodificação local pelo CNEFE 2022 do IBGE (nada sai do computador). O índice (data/cnefe/indice.json.gz,
 * gerado por `npm run data:indice-cnefe`) tem uma "instância" por logradouro: mesmo tipo e nome normalizados e
 * pontos próximos entre si (logradouros homônimos em bairros diferentes viram instâncias diferentes).
 *
 * Níveis de busca, nesta ordem:
 *   0. conhecido    — endereço da lista curada (src/config/enderecosConhecidos.ts: estações, terminais, estádios);
 *   1. exato        — o número existe no CNEFE (coordenada mediana dos endereços com esse número);
 *   2. interpolado  — entre os vizinhos do mesmo lado (paridade), até 200 números e 400 m de distância entre eles
 *                     (mais longe que isso, não geocodifica); sem um dos lados, o vizinho do mesmo lado a até 50 números;
 *   3. curto        — logradouro com menos de 1 km de extensão → ponto central (com número, só se ele estiver
 *                     dentro da faixa de números do trecho ou se o logradouro não tiver outro trecho na cidade);
 *   4. aproximado   — o nome não existe: nome parecido (distância de edição) no mesmo distrito ou vizinho, e
 *                     então 1 a 3 (nível "<n>_aproximado").
 * Homônimos: desempata pelo distrito (do ponto da SSP ou do BAIRRO), depois pelo BAIRRO (localidade do CNEFE);
 * se continuar ambíguo, não geocodifica.
 */

export const VERSAO_INDICE = 1;
export const arquivoIndice = () => path.join(dataDir(), 'cnefe', 'indice.json.gz');

export interface Instancia {
  /** tipo (RUA, AVENIDA...) */
  t: string;
  /** título + nome normalizados */
  c: string;
  /** chave (sem títulos no começo) */
  k: string;
  /** distritos (nome normalizado), do mais frequente para o menos */
  d: string[];
  /** localidades do CNEFE (DSC_LOCALIDADE normalizada) */
  l: string[];
  /** extensão em metros (diagonal da caixa dos pontos) */
  x: number;
  /** ponto central [lat, lng] × 1e6 */
  m: [number, number];
  /** números com coordenada, em ordem */
  n: number[];
  /** lat e lng × 1e6 de cada número */
  la: number[];
  ln: number[];
}

export interface IndiceCnefe {
  versao: number;
  fonte: { arquivo: string; bytes: number; linhas: number };
  contagens: Record<string, number>;
  /** localidade do CNEFE → distrito em que ela está (maioria ≥ 80%) */
  localidades: Record<string, string>;
  /** distrito → distritos vizinhos */
  vizinhos: Record<string, string[]>;
  instancias: Instancia[];
}

export function lerIndice(arquivo = arquivoIndice()): IndiceCnefe {
  if (!fs.existsSync(arquivo)) throw new Error(`Índice do CNEFE não encontrado (${arquivo}). Rode antes: npm run data:indice-cnefe`);
  const ind = JSON.parse(zlib.gunzipSync(fs.readFileSync(arquivo)).toString('utf-8')) as IndiceCnefe;
  if (ind.versao !== VERSAO_INDICE) throw new Error('Índice do CNEFE de outra versão. Rode de novo: npm run data:indice-cnefe');
  return ind;
}

export type Nivel = 'conhecido' | 'exato' | 'interpolado' | 'curto';
export const NIVEIS: Nivel[] = ['conhecido', 'exato', 'interpolado', 'curto'];

export interface Consulta {
  logradouro: string | null;
  numero: number | null;
  bairro: string | null;
  /** distrito do ponto da SSP (quando há coordenada, mesmo suspeita) */
  distrito: string | null;
}

export type Falha =
  | 'sem_logradouro'
  | 'logradouro_nao_encontrado'
  | 'fora_do_distrito'
  | 'ambiguo'
  | 'sem_numero_logradouro_longo'
  | 'numero_fora_do_logradouro'
  | 'interpolacao_distante'
  | 'aproximado_sem_distrito'
  | 'aproximado_ambiguo';

export interface Resultado {
  ok: boolean;
  lat?: number;
  lng?: number;
  /** nível final: exato | interpolado | curto, com sufixo _aproximado quando o nome foi achado por semelhança */
  nivel?: string;
  /** 1 ou 2 vizinhos usados na interpolação */
  lados?: number;
  /** de onde veio o distrito usado no desempate */
  dica?: Exclude<Dica, 'nenhuma'> | null;
  falha?: Falha;
  /** logradouro do CNEFE escolhido, ou o nome do endereço conhecido (para conferência) */
  cnefe?: string;
}

const PARIDADE_MAX = 200;
const VIZINHO_MAX = 50;
/** Interpolação só entre vizinhos a até esta distância um do outro (o Autódromo caía 3 km longe). */
const INTERPOLACAO_MAX_M = 400;
const CURTO_M = 1000;
const TRUNCADO = 38; // a SSP corta o logradouro perto de 40 caracteres

export class Geocodificador {
  private porChave = new Map<string, number[]>();
  private chavesOrdenadas: string[];
  private delecoesParaChaves: Map<string, string[]> | null = null;
  private distritosDaChave = new Map<string, Set<string>>();
  readonly distritos: Set<string>;
  private conhecidos = new Map<string, EnderecoConhecido[]>();

  constructor(
    readonly indice: IndiceCnefe,
    conhecidos: readonly EnderecoConhecido[] = ENDERECOS_CONHECIDOS,
  ) {
    for (const e of conhecidos) {
      const k = `${e.logradouro}|${e.numero ?? ''}`;
      this.conhecidos.set(k, [...(this.conhecidos.get(k) ?? []), e]);
    }
    indice.instancias.forEach((inst, i) => {
      const l = this.porChave.get(inst.k);
      if (l) l.push(i);
      else this.porChave.set(inst.k, [i]);
      const s = this.distritosDaChave.get(inst.k) ?? new Set<string>();
      inst.d.forEach((d) => s.add(d));
      this.distritosDaChave.set(inst.k, s);
    });
    this.chavesOrdenadas = [...this.porChave.keys()].sort();
    this.distritos = new Set(Object.keys(indice.vizinhos));
  }

  /** Distrito para o desempate: o do ponto da SSP; senão o BAIRRO, se for nome de distrito ou de localidade conhecida. */
  dicaDeDistrito(q: Pick<Consulta, 'distrito' | 'bairro'>): { distrito: string | null; dica: Resultado['dica'] } {
    if (q.distrito) return { distrito: q.distrito, dica: 'ponto' };
    if (!q.bairro) return { distrito: null, dica: null };
    const b = normalizarBairro(q.bairro);
    if (this.distritos.has(b)) return { distrito: b, dica: 'bairro' };
    const d = this.indice.localidades[b];
    return d ? { distrito: d, dica: 'localidade' } : { distrito: null, dica: null };
  }

  private perto(distrito: string): Set<string> {
    return new Set([distrito, ...(this.indice.vizinhos[distrito] ?? [])]);
  }

  /** Filtra as instâncias candidatas (tipo, título, distrito, bairro); motivo se nenhuma servir. */
  private filtrar(ids: number[], tipo: string | null, completo: string, distrito: string | null, bairro: string | null): number[] | Falha {
    const inst = this.indice.instancias;
    let c = ids;
    if (tipo) {
      const mesmoTipo = c.filter((i) => inst[i].t === tipo);
      if (mesmoTipo.length) c = mesmoTipo;
    }
    if (c.length > 1) {
      const mesmoNome = c.filter((i) => inst[i].c === completo);
      if (mesmoNome.length) c = mesmoNome;
    }
    if (distrito) {
      const noDistrito = c.filter((i) => inst[i].d.includes(distrito));
      if (noDistrito.length) c = noDistrito;
      else {
        const perto = this.perto(distrito);
        const vizinhas = c.filter((i) => inst[i].d.some((d) => perto.has(d)));
        if (!vizinhas.length) return 'fora_do_distrito';
        c = vizinhas;
      }
    }
    if (c.length > 1 && bairro) {
      const b = normalizarBairro(bairro);
      const naLocalidade = c.filter((i) => inst[i].l.includes(b));
      if (naLocalidade.length) c = naLocalidade;
    }
    return c;
  }

  /**
   * Entre várias instâncias que sobraram (homônimos ou o mesmo logradouro partido por um vazio de endereços, como
   * avenidas longas), fica a que tem o número (exato ou interpolado). Se mais de uma tiver e os pontos estiverem a
   * até 300 m um do outro, é o mesmo lugar; senão, ambíguo.
   */
  private resolver(c: number[], numero: number | null): { i: number; r: Omit<Resultado, 'dica'> } | Falha {
    if (c.length === 1) return { i: c[0], r: this.noLogradouro(c[0], numero) };
    if (!numero) return 'ambiguo';
    const com = c.map((i) => ({ i, r: this.noLogradouro(i, numero) })).filter((x) => x.r.nivel === 'exato' || x.r.nivel === 'interpolado');
    if (!com.length) return 'ambiguo';
    com.sort((a, b) => (a.r.nivel === 'exato' ? 0 : 1) - (b.r.nivel === 'exato' ? 0 : 1));
    const p = com[0].r;
    return com.every((x) => distanciaM(p.lat!, p.lng!, x.r.lat!, x.r.lng!) <= 300) ? com[0] : 'ambiguo';
  }

  /** Número dentro da instância: exato → interpolado → curto. */
  private noLogradouro(i: number, numero: number | null): Omit<Resultado, 'dica'> {
    const inst = this.indice.instancias[i];
    const ponto = (la: number, ln: number) => ({ lat: la / 1e6, lng: ln / 1e6 });
    const n = inst.n;
    // Com número fora da faixa do trecho e outro trecho com o mesmo nome na cidade, o número está no outro trecho
    // ("Av. Dr. Assis Ribeiro, 4777" caía no centro de um pedaço curto, 2 km longe).
    const foraDaFaixa = !!numero && n.length > 0 && (numero < n[0] || numero > n[n.length - 1]) && this.porChave.get(inst.k)!.length > 1;
    const curto = (): Omit<Resultado, 'dica'> =>
      inst.x < CURTO_M && !foraDaFaixa
        ? { ok: true, ...ponto(inst.m[0], inst.m[1]), nivel: 'curto' }
        : { ok: false, falha: numero ? 'numero_fora_do_logradouro' : 'sem_numero_logradouro_longo' };
    if (!numero || !n.length) return curto();
    // busca binária: primeira posição com n[p] >= numero
    let lo = 0;
    let hi = n.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (n[mid] < numero) lo = mid + 1;
      else hi = mid;
    }
    if (n[lo] === numero) return { ok: true, ...ponto(inst.la[lo], inst.ln[lo]), nivel: 'exato' };
    const par = numero % 2;
    let a = -1;
    for (let j = lo - 1; j >= 0 && numero - n[j] <= PARIDADE_MAX; j--)
      if (n[j] % 2 === par) {
        a = j;
        break;
      }
    let b = -1;
    for (let j = lo; j < n.length && n[j] - numero <= PARIDADE_MAX; j++)
      if (n[j] % 2 === par) {
        b = j;
        break;
      }
    let distante = false;
    if (a >= 0 && b >= 0 && n[b] - n[a] <= PARIDADE_MAX) {
      distante = distanciaM(inst.la[a] / 1e6, inst.ln[a] / 1e6, inst.la[b] / 1e6, inst.ln[b] / 1e6) > INTERPOLACAO_MAX_M;
      if (!distante) {
        const t = (numero - n[a]) / (n[b] - n[a]);
        return { ok: true, ...ponto(inst.la[a] + t * (inst.la[b] - inst.la[a]), inst.ln[a] + t * (inst.ln[b] - inst.ln[a])), nivel: 'interpolado', lados: 2 };
      }
    }
    // Vizinhos longe um do outro: o número fica num vão do CNEFE; não chuta (nem o vizinho nem o centro). Na
    // calibração, voltar para o vizinho mais próximo nesses casos punha ~30% a mais de 1 km.
    if (distante) return { ok: false, falha: 'interpolacao_distante' };
    const perto = [a, b].filter((j) => j >= 0 && Math.abs(n[j] - numero) <= VIZINHO_MAX).sort((x, y) => Math.abs(n[x] - numero) - Math.abs(n[y] - numero));
    if (perto.length) return { ok: true, ...ponto(inst.la[perto[0]], inst.ln[perto[0]]), nivel: 'interpolado', lados: 1 };
    return curto();
  }

  /** Endereço da lista curada: mesmo logradouro e número (ou sem número) e, se a lista pedir, um dos bairros. */
  private conhecido(logradouro: string, numero: number | null, bairro: string | null): EnderecoConhecido | null {
    const lista = this.conhecidos.get(`${logradouro}|${numero ?? ''}`);
    if (!lista) return null;
    const b = bairro ? normalizarBairro(bairro) : null;
    return lista.find((e) => !e.bairros || (b !== null && e.bairros.includes(b))) ?? null;
  }

  private fuzzy(chave: string, distrito: string): string[] | 'aproximado_ambiguo' | null {
    if (chave.length < 6) return null;
    if (!this.delecoesParaChaves) {
      this.delecoesParaChaves = new Map();
      for (const k of this.porChave.keys())
        if (k.length >= 5)
          for (const d of delecoes(k)) {
            const l = this.delecoesParaChaves.get(d);
            if (l) l.push(k);
            else this.delecoesParaChaves.set(d, [k]);
          }
    }
    const limite = chave.length <= 10 ? 1 : 2;
    const perto = this.perto(distrito);
    const vistos = new Set<string>();
    let melhor = Infinity;
    let achados: string[] = [];
    for (const d of delecoes(chave))
      for (const k of this.delecoesParaChaves.get(d) ?? []) {
        if (vistos.has(k) || k === chave) continue;
        vistos.add(k);
        if (![...this.distritosDaChave.get(k)!].some((x) => perto.has(x))) continue;
        const dist = distanciaEdicao(chave, k, limite);
        if (dist > limite) continue;
        if (dist < melhor) (melhor = dist), (achados = [k]);
        else if (dist === melhor) achados.push(k);
      }
    if (!achados.length) return null;
    return achados.length > 1 ? 'aproximado_ambiguo' : achados;
  }

  private porPrefixo(chave: string): string[] {
    let lo = 0;
    let hi = this.chavesOrdenadas.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (this.chavesOrdenadas[mid] < chave) lo = mid + 1;
      else hi = mid;
    }
    const out: string[] = [];
    for (let j = lo; j < this.chavesOrdenadas.length && this.chavesOrdenadas[j].startsWith(chave); j++) out.push(this.chavesOrdenadas[j]);
    return out;
  }

  geocodificar(q: Consulta): Resultado {
    if (!q.logradouro) return { ok: false, falha: 'sem_logradouro' };
    const lg = analisarLogradouro(q.logradouro);
    if (!lg.chave) return { ok: false, falha: 'sem_logradouro' };
    // O número escrito no próprio logradouro ("RODOVIA DOS IMIGRANTES, 1500") vale mais que a coluna NUMERO, que às
    // vezes vem cortada (1, 15).
    const numero = lg.numero ?? (lg.semNumero ? null : q.numero);
    const { distrito, dica } = this.dicaDeDistrito(q);
    const conhecido = this.conhecido(`${lg.tipo ?? ''} ${lg.completo}`.trim(), numero, q.bairro);
    if (conhecido) return { ok: true, lat: conhecido.lat, lng: conhecido.lng, nivel: 'conhecido', dica, cnefe: conhecido.nome };
    let ids = this.porChave.get(lg.chave);
    let aproximado = false;
    if (!ids && q.logradouro.trim().length >= TRUNCADO) {
      const pre = this.porPrefixo(lg.chave);
      if (pre.length) ids = pre.flatMap((k) => this.porChave.get(k)!);
    }
    if (!ids) {
      if (!distrito) return { ok: false, falha: 'aproximado_sem_distrito', dica };
      const f = this.fuzzy(lg.chave, distrito);
      if (!f) return { ok: false, falha: 'logradouro_nao_encontrado', dica };
      if (f === 'aproximado_ambiguo') return { ok: false, falha: f, dica };
      ids = f.flatMap((k) => this.porChave.get(k)!);
      aproximado = true;
    }
    const c = this.filtrar(ids, lg.tipo, lg.completo, distrito, q.bairro);
    if (typeof c === 'string') return { ok: false, falha: c, dica };
    const escolhido = this.resolver(c, numero);
    if (typeof escolhido === 'string') return { ok: false, falha: escolhido, dica };
    const { i, r } = escolhido;
    const inst = this.indice.instancias[i];
    return { ...r, nivel: r.nivel && aproximado ? `${r.nivel}_aproximado` : r.nivel, dica, cnefe: `${inst.t} ${inst.c}` };
  }
}

/** Mediana de um array (não ordena o original). */
export function mediana(xs: ArrayLike<number>): number {
  const a = Array.from(xs).sort((x, y) => x - y);
  if (!a.length) return NaN;
  const m = a.length >> 1;
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
}

/** Extensão (diagonal da caixa) em metros. */
export function extensaoM(lats: ArrayLike<number>, lngs: ArrayLike<number>): number {
  let [a, b, c, d] = [Infinity, -Infinity, Infinity, -Infinity];
  for (let i = 0; i < lats.length; i++) {
    if (lats[i] < a) a = lats[i];
    if (lats[i] > b) b = lats[i];
    if (lngs[i] < c) c = lngs[i];
    if (lngs[i] > d) d = lngs[i];
  }
  return lats.length ? distanciaM(a, c, b, d) : 0;
}
