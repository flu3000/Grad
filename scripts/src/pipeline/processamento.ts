/**
 * Estágio B — processamento. Um pool de processos lê as partes limpas (data/SSP-SP/limpo) e gera, para cada uma,
 * uma agregação parcial em scripts/out/cache/parciais/<hash>/<parte>.json. O hash cobre as regras, os pesos, o
 * código e as linhas excluídas pela deduplicação: se nada mudou, a parte é pulada.
 *
 * Antes do pool, o processo principal monta o índice de BOs (id_bo): o BO conta uma vez, na categoria mais grave
 * (decisão 12), mesmo que as linhas estejam em partes, abas ou arquivos diferentes.
 */
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import { polygonToCellsExperimental, POLYGON_TO_CELLS_FLAGS } from 'h3-js';
import { CRIME_RULES, CRIME_WEIGHTS, DISTRIBUIR_SEM_LOCALIZACAO, maisGrave, normalizeText, type CrimeCategory } from '../config/crimeWeights';
import { CHAVES_PONTOS_PADRAO, chavePonto } from '../config/pontosPadrao';
import { somarDistribuido, somarPonto, type Agregado, type Celula } from '../lib/agregacao';
import { readGeoSampa } from '../lib/city';
import { periodoDaHora, type Periodo, PERIODOS } from '../lib/horario';
import { COLUNAS_LIMPAS, dividirCsv, lerLinhaCsv, type LinhaLimpa } from '../lib/limpeza';
import { carregarMunicipio } from '../lib/municipio';
import { outDir } from '../lib/paths';
import { avisarProgresso, ehTrabalhador, rodarEmPool, servirTarefas, workersPadrao } from '../lib/pool';
import { RESOLUTIONS } from '../lib/scoring';
import { ehLocalPublico, normalizarBairro } from '../lib/semLocalizacao';
import { IBGE_CAPITAL } from '../lib/valores';
import { lerManifesto, partesDoManifesto, pastaLimpo, type Parte } from './extracao';

/** Regras do processamento. A linha de base usa REGRAS_PADRAO; as outras servem para medir o efeito de cada mudança. */
export interface Regras {
  anos: number[];
  /** 'bo' = uma vez por BO, na categoria mais grave; 'bo_categoria' = uma vez por BO e categoria (regra antiga); 'nenhuma'. */
  deduplicar: 'bo' | 'bo_categoria' | 'nenhuma';
  tema506: boolean;
  pontosPadrao: boolean;
}

export const REGRAS_PADRAO: Regras = { anos: [2023, 2024, 2025, 2026], deduplicar: 'bo', tema506: true, pontosPadrao: true };

/** Classificação com a opção de desligar a regra do Tema 506 (só para medir o efeito dela). */
export function classificar(rubrica: string | null, natureza: string | null, regras: Pick<Regras, 'tema506'>): CrimeCategory {
  const texto = normalizeText(`${rubrica ?? ''} | ${natureza ?? ''}`);
  for (const [i, [categoria, re]] of CRIME_RULES.entries()) {
    if (i === 0 && !regras.tema506) continue; // regra 0 = Tema 506
    if (re.test(texto)) return categoria;
  }
  return 'outros';
}

// ---------------------------------------------------------------------------------------------- estatísticas

export interface CidadeAno {
  linhas: number;
  pontos: number;
  distribuidos: number;
  distribuidosPorCategoria: Partial<Record<CrimeCategory, number>>;
  semLocalizacao: { sigilo: number; semCoordenada: number; pontoForaDoMunicipio: number; pontoPadrao: number };
  semLocalizacaoPorCategoria: Partial<Record<CrimeCategory, number>>;
  porCategoria: Partial<Record<CrimeCategory, number>>;
  pontosPorCategoria: Partial<Record<CrimeCategory, number>>;
  /** BOs com ponto: com hora exata, só com período, sem nenhum. */
  horario: { hora: number; soPeriodo: number; nenhum: number };
  pontosPorPeriodo: number[];
  /** Mês da ocorrência "AAAA-MM" → atraso em meses até o registro → BOs (todos os BOs da capital no ano). */
  atraso: Record<string, Record<string, number>>;
}

const novaCidade = (): CidadeAno => ({
  linhas: 0,
  pontos: 0,
  distribuidos: 0,
  distribuidosPorCategoria: {},
  semLocalizacao: { sigilo: 0, semCoordenada: 0, pontoForaDoMunicipio: 0, pontoPadrao: 0 },
  semLocalizacaoPorCategoria: {},
  porCategoria: {},
  pontosPorCategoria: {},
  horario: { hora: 0, soPeriodo: 0, nenhum: 0 },
  pontosPorPeriodo: [0, 0, 0, 0],
  atraso: {},
});

export interface Global {
  linhasLidas: number;
  linhasExcluidasPelaDeduplicacao: number;
  semDataDeOcorrencia: number;
  foraDosAnos: Record<string, number>;
}

export interface Parcial {
  parte: string;
  hash: string;
  agregado: Record<string, Celula>;
  cidade: Record<string, CidadeAno>;
  global: Global;
}

const inc = <K extends string>(o: Partial<Record<K, number>>, k: K, n = 1) => {
  o[k] = (o[k] ?? 0) + n;
};

// ------------------------------------------------------------------------------------- índice de BOs (global)

export interface IndiceBos {
  /** parte → números de linha (da planilha) excluídos. */
  excluir: Map<string, number[]>;
  linhasComId: number;
  bos: number;
  excluidas: number;
  /** BOs com mais de uma linha e categorias diferentes: combinação (ordenada, a mais grave primeiro) → BOs. */
  naturezasSecundarias: { bos: number; combinacoes: [string, number][] };
  repetidosEntreArquivos: number;
}

const IDX = Object.fromEntries(COLUNAS_LIMPAS.map((c, i) => [c, i])) as Record<(typeof COLUNAS_LIMPAS)[number], number>;

function lerPartes(parte: Parte): string[] {
  const texto = zlib.gunzipSync(fs.readFileSync(path.join(pastaLimpo(), parte.arquivo))).toString('utf-8');
  const linhas = texto.split('\n');
  linhas.shift(); // cabeçalho
  if (linhas.at(-1) === '') linhas.pop();
  return linhas;
}

export function montarIndice(partes: Parte[], regras: Regras): IndiceBos {
  const grupos = new Map<string, { parte: string; linha: number; categoria: CrimeCategory; arquivo: string }[]>();
  let linhasComId = 0;
  for (const parte of partes)
    for (const l of lerPartes(parte)) {
      const c = dividirCsv(l);
      const id = c[IDX.id_bo];
      if (!id) continue;
      linhasComId++;
      const item = { parte: parte.arquivo, linha: Number(c[IDX.linha]), categoria: classificar(c[IDX.rubrica] || null, c[IDX.natureza] || null, regras), arquivo: c[IDX.arquivo] };
      const g = grupos.get(id);
      if (g) g.push(item);
      else grupos.set(id, [item]);
    }
  const excluir = new Map<string, number[]>();
  const marcar = (it: { parte: string; linha: number }) => {
    const l = excluir.get(it.parte);
    if (l) l.push(it.linha);
    else excluir.set(it.parte, [it.linha]);
  };
  const combinacoes = new Map<string, number>();
  let excluidas = 0;
  let comSecundarias = 0;
  let entreArquivos = 0;
  for (const g of grupos.values()) {
    if (g.length === 1) continue;
    if (new Set(g.map((x) => x.arquivo)).size > 1) entreArquivos++;
    const categorias = [...new Set(g.map((x) => x.categoria))];
    if (categorias.length > 1) {
      comSecundarias++;
      const principal = maisGrave(categorias);
      const k = [principal, ...categorias.filter((c) => c !== principal).sort()].join(' + ');
      combinacoes.set(k, (combinacoes.get(k) ?? 0) + 1);
    }
    if (regras.deduplicar === 'nenhuma') continue;
    if (regras.deduplicar === 'bo') {
      const principal = maisGrave(categorias);
      const fica = g.find((x) => x.categoria === principal)!; // a primeira linha da categoria mais grave
      for (const x of g) if (x !== fica) (marcar(x), excluidas++);
    } else {
      const vistas = new Set<CrimeCategory>();
      for (const x of g) {
        if (vistas.has(x.categoria)) (marcar(x), excluidas++);
        vistas.add(x.categoria);
      }
    }
  }
  return {
    excluir,
    linhasComId,
    bos: grupos.size,
    excluidas,
    naturezasSecundarias: { bos: comSecundarias, combinacoes: [...combinacoes].sort((a, b) => b[1] - a[1]).slice(0, 40) },
    repetidosEntreArquivos: entreArquivos,
  };
}

// ------------------------------------------------------------------------------------- processamento da parte

/** Gancho da geocodificação (Etapa 2). Na linha de base fica vazio: só as coordenadas da SSP. */
export type Geocodificador = (l: LinhaLimpa) => { lat: number; lng: number } | null;
export const semGeocodificacao: Geocodificador = () => null;

/** Hexágonos de cada distrito (centro dentro do distrito; se nenhum, os que tocam), por resolução. */
export function hexagonosDosDistritos(): Map<string, Map<number, string[]>> {
  const mapa = new Map<string, Map<number, string[]>>();
  for (const f of readGeoSampa<{ nm_distrito_municipal: string }>('distritos')) {
    const porRes = new Map<number, string[]>();
    for (const res of RESOLUTIONS) {
      const de = (flag: string) => [...new Set(f.geometry.coordinates.flatMap((poly) => polygonToCellsExperimental(poly, res, flag, true)))];
      const cells = de(POLYGON_TO_CELLS_FLAGS.containmentCenter);
      porRes.set(res, cells.length ? cells : de(POLYGON_TO_CELLS_FLAGS.containmentOverlapping));
    }
    mapa.set(normalizarBairro(f.properties.nm_distrito_municipal), porRes);
  }
  return mapa;
}

const mesesEntre = (de: string, ate: string) => (Number(ate.slice(0, 4)) - Number(de.slice(0, 4))) * 12 + Number(ate.slice(5, 7)) - Number(de.slice(5, 7));

/** Processa as linhas de uma parte (função pura sobre os dados; usada pelo filho e pelo teste sequencial). */
export function processarLinhas(
  linhas: Iterable<LinhaLimpa>,
  regras: Regras,
  ctx: {
    excluir: ReadonlySet<number>;
    distritoDe: (lat: number, lng: number) => string | null;
    hexDoDistrito: ReadonlyMap<string, ReadonlyMap<number, readonly string[]>>;
    geocodificar?: Geocodificador;
  },
): { agregado: Agregado; cidade: Record<string, CidadeAno>; global: Global } {
  const agregado: Agregado = new Map();
  const cidade: Record<string, CidadeAno> = {};
  const global: Global = { linhasLidas: 0, linhasExcluidasPelaDeduplicacao: 0, semDataDeOcorrencia: 0, foraDosAnos: {} };
  const anos = new Set(regras.anos);
  const geocodificar = ctx.geocodificar ?? semGeocodificacao;
  for (const l of linhas) {
    global.linhasLidas++;
    if (ctx.excluir.has(l.linha)) {
      global.linhasExcluidasPelaDeduplicacao++;
      continue;
    }
    if (!l.data_ocorrencia) {
      global.semDataDeOcorrencia++;
      continue;
    }
    const ano = Number(l.data_ocorrencia.slice(0, 4));
    if (!anos.has(ano)) {
      inc(global.foraDosAnos, String(ano));
      continue;
    }
    const mes = Number(l.data_ocorrencia.slice(5, 7));
    const c = (cidade[ano] ??= novaCidade());
    c.linhas++;
    const categoria = classificar(l.rubrica, l.natureza, regras);
    inc(c.porCategoria, categoria);
    if (l.data_registro) {
      const atraso = Math.min(36, Math.max(0, mesesEntre(l.data_ocorrencia, l.data_registro)));
      inc((c.atraso[l.data_ocorrencia.slice(0, 7)] ??= {}), String(atraso));
    }
    const hora = l.hora ? Number(l.hora.slice(0, 2)) : null;
    const periodo: Periodo | null =
      hora !== null ? periodoDaHora(hora) : l.periodo && (PERIODOS as readonly string[]).includes(l.periodo) ? (l.periodo as Periodo) : null;
    const o = { ano, mes, hora, periodo, categoria, peso: CRIME_WEIGHTS[categoria] };

    // Localização: coordenada da SSP (fora dos pontos padrão e dentro da capital) → geocodificação → distrito.
    let lat = l.lat;
    let lng = l.lng;
    let motivo: keyof CidadeAno['semLocalizacao'] | null = null;
    if (lat !== null && lng !== null) {
      if (regras.pontosPadrao && CHAVES_PONTOS_PADRAO.has(chavePonto(lat, lng))) motivo = 'pontoPadrao';
      else if (!ctx.distritoDe(lat, lng)) motivo = 'pontoForaDoMunicipio';
      if (motivo) lat = lng = null;
    }
    let geocodificado = false;
    if (lat === null || lng === null) {
      const g = geocodificar(l);
      if (g && ctx.distritoDe(g.lat, g.lng)) {
        lat = g.lat;
        lng = g.lng;
        geocodificado = true;
        motivo = null;
      }
    }
    if (lat !== null && lng !== null) {
      somarPonto(agregado, lat, lng, o, geocodificado);
      c.pontos++;
      inc(c.pontosPorCategoria, categoria);
      if (hora !== null) c.horario.hora++;
      else if (periodo) c.horario.soPeriodo++;
      else c.horario.nenhum++;
      if (periodo) c.pontosPorPeriodo[PERIODOS.indexOf(periodo)]++;
      continue;
    }
    // Sem ponto: estupro (DISTRIBUIR_SEM_LOCALIZACAO) da capital, em local público e com BAIRRO = distrito → distrito.
    const distrito = l.bairro ? normalizarBairro(l.bairro) : null;
    const hexs = distrito ? ctx.hexDoDistrito.get(distrito) : undefined;
    if (
      DISTRIBUIR_SEM_LOCALIZACAO.includes(categoria) &&
      l.cod_ibge === IBGE_CAPITAL &&
      ehLocalPublico(`${l.tipo_local ?? ''} ${l.subtipo_local ?? ''}`) &&
      hexs
    ) {
      somarDistribuido(agregado, hexs, o);
      c.distribuidos++;
      inc(c.distribuidosPorCategoria, categoria);
      continue;
    }
    c.semLocalizacao[motivo ?? (l.sigilo ? 'sigilo' : 'semCoordenada')]++;
    inc(c.semLocalizacaoPorCategoria, categoria);
  }
  return { agregado, cidade, global };
}

export const pastaParciais = (hash: string) => path.join(outDir, 'cache', 'parciais', hash);

export interface TarefaProcessamento {
  parte: Parte;
  regras: Regras;
  excluir: number[];
  hash: string;
  destino: string;
}

let contexto: { distritoDe: (lat: number, lng: number) => string | null; hexDoDistrito: Map<string, Map<number, string[]>> } | null = null;

export async function processarParte(t: TarefaProcessamento): Promise<{ parte: string; linhas: number }> {
  contexto ??= { distritoDe: carregarMunicipio().distritoDe, hexDoDistrito: hexagonosDosDistritos() };
  const brutas = lerPartes(t.parte);
  let n = 0;
  const linhas = (function* () {
    for (const b of brutas) {
      if (++n % 25_000 === 0) avisarProgresso(t.parte.arquivo, n);
      yield lerLinhaCsv(b);
    }
  })();
  const r = processarLinhas(linhas, t.regras, { ...contexto, excluir: new Set(t.excluir) });
  const parcial: Parcial = { parte: t.parte.arquivo, hash: t.hash, agregado: Object.fromEntries(r.agregado), cidade: r.cidade, global: r.global };
  fs.mkdirSync(path.dirname(t.destino), { recursive: true });
  fs.writeFileSync(`${t.destino}.tmp`, JSON.stringify(parcial));
  fs.renameSync(`${t.destino}.tmp`, t.destino);
  avisarProgresso(t.parte.arquivo, brutas.length);
  return { parte: t.parte.arquivo, linhas: brutas.length };
}

// --------------------------------------------------------------------------------------------- orquestração

/** Hash da configuração: regras, pesos, regras de classificação, pontos padrão e o código do processamento. */
export function hashDaConfiguracao(regras: Regras): string {
  const fontes = [
    __filename,
    path.join(__dirname, '../lib/agregacao.ts'),
    path.join(__dirname, '../lib/horario.ts'),
    path.join(__dirname, '../lib/semLocalizacao.ts'),
    path.join(__dirname, '../config/crimeWeights.ts'),
    path.join(__dirname, '../config/pontosPadrao.ts'),
  ].map((f) => (fs.existsSync(f) ? fs.readFileSync(f, 'utf-8') : f));
  return crypto
    .createHash('sha1')
    .update(JSON.stringify({ regras, pesos: CRIME_WEIGHTS, fontes }))
    .digest('hex')
    .slice(0, 12);
}

const nomeParcial = (parte: Parte, excluir: number[]) =>
  `${parte.arquivo.replace(/[\\/]/g, '__').replace(/\.csv\.gz$/, '')}__${crypto.createHash('sha1').update(`${parte.bytes}|${excluir.join(',')}`).digest('hex').slice(0, 8)}.json`;

export interface ResultadoProcessamento {
  hash: string;
  parciais: string[];
  partes: Parte[];
  indice: Omit<IndiceBos, 'excluir'>;
  /** parte → linhas excluídas pela deduplicação (para reprocessar uma parte igual). */
  excluir: Record<string, number[]>;
  processadas: number;
  puladas: number;
  workers: number;
  segundos: number;
  segundosIndice: number;
}

export async function processarTudo(
  regras: Regras = REGRAS_PADRAO,
  opcoes: { workers?: number; partes?: [number, number]; sequencial?: boolean; silencioso?: boolean } = {},
): Promise<ResultadoProcessamento> {
  const inicio = Date.now();
  const manifesto = lerManifesto();
  const todas = partesDoManifesto(manifesto);
  if (!todas.length) throw new Error('Nenhuma parte limpa. Rode antes: npm run data:limpar');
  const hash = hashDaConfiguracao(regras);
  const log = opcoes.silencioso ? () => {} : console.log;
  log(`  Configuração ${hash} (${JSON.stringify(regras)})`);
  const indice = montarIndice(todas, regras);
  const segundosIndice = Math.round((Date.now() - inicio) / 1000);
  log(`  Índice de BOs: ${indice.bos} BOs, ${indice.excluidas} linhas excluídas pela deduplicação (${segundosIndice} s)`);
  const tarefas: TarefaProcessamento[] = todas.map((parte) => {
    const excluir = (indice.excluir.get(parte.arquivo) ?? []).sort((a, b) => a - b);
    return { parte, regras, excluir, hash, destino: path.join(pastaParciais(hash), nomeParcial(parte, excluir)) };
  });
  const [de, ate] = opcoes.partes ?? [1, tarefas.length];
  const escolhidas = new Set(tarefas.slice(de - 1, ate));
  const pendentes = tarefas.filter((t) => (opcoes.partes ? escolhidas.has(t) : !fs.existsSync(t.destino)));
  const workers = opcoes.sequencial ? 1 : (opcoes.workers ?? workersPadrao(800, pendentes.length));
  if (pendentes.length) {
    log(`  Processando ${pendentes.length} de ${tarefas.length} partes ${opcoes.sequencial ? 'em sequência' : `com ${workers} processos`}...`);
    const feito = new Map<string, number>();
    const total = pendentes.reduce((s, t) => s + t.parte.linhas, 0);
    const timer = opcoes.silencioso
      ? null
      : setInterval(() => {
          const s = (Date.now() - inicio) / 1000;
          const n = [...feito.values()].reduce((a, b) => a + b, 0);
          const vel = n / s;
          process.stdout.write(`  ${n}/${total} linhas | ${Math.round(vel)} linhas/s | faltam ~${Math.round((total - n) / Math.max(vel, 1))} s   \r`);
        }, 2000);
    try {
      if (opcoes.sequencial) for (const t of pendentes) await processarParte(t);
      else await rodarEmPool(__filename, pendentes, { workers, mbPorFilho: 1500, aoProgredir: (p) => feito.set(p.chave, p.feito) });
    } finally {
      if (timer) clearInterval(timer);
    }
  }
  const segundos = Math.round((Date.now() - inicio) / 1000);
  log(`\n  Partes: ${pendentes.length} processadas, ${tarefas.length - pendentes.length} puladas (cache) em ${segundos} s`);
  const { excluir, ...resto } = indice;
  return {
    hash,
    parciais: tarefas.map((t) => t.destino),
    partes: todas,
    indice: resto,
    excluir: Object.fromEntries(tarefas.map((t) => [t.parte.arquivo, t.excluir])),
    processadas: pendentes.length,
    puladas: tarefas.length - pendentes.length,
    workers,
    segundos,
    segundosIndice,
  };
}

if (ehTrabalhador() && require.main === module) servirTarefas(processarParte);
