/**
 * Estágio C — consolidação. Soma as parciais, mede a curva de atraso do registro, define a cobertura de cada ano,
 * calcula a escala fixa (cortes dos anos completos juntos), os níveis do dia inteiro, por período e por hora,
 * confere as invariantes e grava em scripts/out/consolidado/<nome>/:
 *   hex_stats.ndjson.gz (uma linha por resolução × hexágono × ano com BO), level_breaks.json, datasets.json,
 *   event_venues.json (locais de evento por ano) e relatorio.json
 */
import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import { cellArea, polygonToCellsExperimental, POLYGON_TO_CELLS_FLAGS } from 'h3-js';
import {
  densidadesPorHora,
  densidadesPorPeriodo,
  fatorAnual,
  lerChave,
  somar,
  somaDosMeses,
  type Agregado,
  type Celula,
} from '../lib/agregacao';
import { DIA_DE_PICO, LOCAIS_DE_EVENTO, MANTER_LOCAL } from '../config/locaisDeEvento';
import { readGeoSampa } from '../lib/city';
import { PERIODOS } from '../lib/horario';
import { carregarMunicipio } from '../lib/municipio';
import { outDir } from '../lib/paths';
import { levelBreaks, levelFor, QUANTIS_DOS_CORTES, RESOLUTIONS, TOTAL_NIVEIS } from '../lib/scoring';
import { lerManifesto, pastaLimpo } from './extracao';
import {
  geocodificadorDoCache,
  hexagonosDosDistritos,
  novaGeo,
  processarLinhas,
  type CidadeAno,
  type Global,
  type Parcial,
  type Regras,
  type ResultadoProcessamento,
} from './processamento';
import { lerLinhaCsv } from '../lib/limpeza';

/** Completude mínima (fração esperada já registrada) para um mês entrar no nível do ano parcial. */
export const COMPLETUDE_MINIMA = 0.95;
/** Janela (meses depois da ocorrência) usada como "total esperado" na curva de atraso. */
export const JANELA_ATRASO = 9;

export type Escala = 'fixa' | 'por_ano';
/**
 * Anualização do ano parcial (meses 1..L): 'linear' = × 12/L; 'sazonal' = ÷ fração do peso do ano que cai nos
 * meses 1..L, na média dos anos completos (a cidade inteira, por peso).
 */
export type Anualizacao = 'linear' | 'sazonal';

// -------------------------------------------------------------------------------------------- somas

function somarObj(a: Record<string, number>, b: Record<string, number>) {
  for (const [k, v] of Object.entries(b)) a[k] = (a[k] ?? 0) + v;
}

export function somarCidade(a: CidadeAno, b: CidadeAno) {
  a.linhas += b.linhas;
  a.pontos += b.pontos;
  a.distribuidos += b.distribuidos;
  somarObj(a.distribuidosPorCategoria, b.distribuidosPorCategoria);
  somarObj(a.semLocalizacao, b.semLocalizacao);
  somarObj(a.semLocalizacaoPorCategoria, b.semLocalizacaoPorCategoria);
  somarObj(a.porCategoria, b.porCategoria);
  somarObj(a.pontosPorCategoria, b.pontosPorCategoria);
  somarObj(a.horario, b.horario);
  b.pontosPorPeriodo.forEach((n, i) => (a.pontosPorPeriodo[i] += n));
  for (const [m, lags] of Object.entries(b.atraso)) somarObj((a.atraso[m] ??= {}), lags);
  somarProfundo((a.geo ??= novaGeo()) as unknown as Record<string, unknown>, (b.geo ?? novaGeo()) as unknown as Record<string, unknown>);
  somarObj((a.sigiloPorCategoria ??= {}), b.sigiloPorCategoria ?? {});
  somarProfundo((a.eventos ??= {}) as Record<string, unknown>, (b.eventos ?? {}) as Record<string, unknown>);
}

/** a += b em objetos de contagem aninhados. */
function somarProfundo(a: Record<string, unknown>, b: Record<string, unknown>) {
  for (const [k, v] of Object.entries(b)) {
    if (typeof v === 'number') a[k] = ((a[k] as number) ?? 0) + v;
    else if (v && typeof v === 'object') somarProfundo((a[k] ??= {}) as Record<string, unknown>, v as Record<string, unknown>);
  }
}

export function somarParciais(parciais: Pick<Parcial, 'agregado' | 'cidade' | 'global'>[]) {
  const agregado: Agregado = new Map();
  const cidade: Record<string, CidadeAno> = {};
  const global: Global = { linhasLidas: 0, linhasExcluidasPelaDeduplicacao: 0, semDataDeOcorrencia: 0, foraDosAnos: {} };
  for (const p of parciais) {
    somar(agregado, p.agregado);
    for (const [ano, c] of Object.entries(p.cidade)) {
      if (cidade[ano]) somarCidade(cidade[ano], c);
      else cidade[ano] = structuredClone(c);
    }
    global.linhasLidas += p.global.linhasLidas;
    global.linhasExcluidasPelaDeduplicacao += p.global.linhasExcluidasPelaDeduplicacao;
    global.semDataDeOcorrencia += p.global.semDataDeOcorrencia;
    somarObj(global.foraDosAnos, p.global.foraDosAnos);
  }
  return { agregado, cidade, global };
}

// ------------------------------------------------------------------------------- atraso e cobertura

const mesNum = (m: string) => Number(m.slice(0, 4)) * 12 + Number(m.slice(5, 7)) - 1;
const mesTexto = (n: number) => `${Math.floor(n / 12)}-${String((n % 12) + 1).padStart(2, '0')}`;

export interface CurvaDeAtraso {
  /** Último mês de registro presente nos dados ("AAAA-MM"). */
  corte: string;
  /** curva[k] = fração dos BOs (registrados em até JANELA_ATRASO meses) que já estavam registrados até o fim de M+k. */
  curva: number[];
  mesesDeReferencia: string[];
  /** Fração registrada depois da janela, nos meses com acompanhamento longo (≥ 24 meses). */
  caudaDepoisDaJanela: number;
}

export function curvaDeAtraso(cidade: Record<string, CidadeAno>): CurvaDeAtraso {
  const porMes: Record<string, Record<string, number>> = {};
  for (const c of Object.values(cidade)) for (const [m, lags] of Object.entries(c.atraso)) somarObj((porMes[m] ??= {}), lags);
  const corte = Math.max(...Object.entries(porMes).flatMap(([m, lags]) => Object.keys(lags).map((k) => mesNum(m) + Number(k))));
  const referencia = Object.keys(porMes)
    .filter((m) => corte - mesNum(m) >= JANELA_ATRASO)
    .sort();
  const ate = Array(JANELA_ATRASO + 1).fill(0);
  let base = 0;
  for (const m of referencia)
    for (const [k, n] of Object.entries(porMes[m]))
      if (Number(k) <= JANELA_ATRASO) {
        base += n;
        for (let j = Number(k); j <= JANELA_ATRASO; j++) ate[j] += n;
      }
  let longo = 0;
  let depois = 0;
  for (const m of Object.keys(porMes).filter((x) => corte - mesNum(x) >= 24))
    for (const [k, n] of Object.entries(porMes[m])) {
      longo += n;
      if (Number(k) > JANELA_ATRASO) depois += n;
    }
  return { corte: mesTexto(corte), curva: ate.map((x) => x / base), mesesDeReferencia: referencia, caudaDepoisDaJanela: longo ? depois / longo : 0 };
}

export interface Cobertura {
  year: number;
  first_month: number;
  last_month: number;
  /** Último mês com completude esperada ≥ 95% (os seguintes ficam fora do nível anualizado). */
  last_complete_month: number;
  months_covered: number;
  complete: boolean;
  completude_por_mes: number[];
  linhas_por_mes: number[];
}

export function cobertura(ano: number, c: CidadeAno, curva: CurvaDeAtraso): Cobertura {
  const linhas = Array(12).fill(0);
  for (const [m, lags] of Object.entries(c.atraso))
    if (m.startsWith(String(ano))) linhas[Number(m.slice(5, 7)) - 1] += Object.values(lags).reduce((a, b) => a + b, 0);
  const corte = mesNum(curva.corte);
  const completude = linhas.map((_, i) => {
    const d = corte - (ano * 12 + i);
    return d < 0 ? 0 : d >= JANELA_ATRASO ? 1 : curva.curva[d];
  });
  const media = linhas.reduce((a, b) => a + b, 0) / Math.max(1, linhas.filter(Boolean).length);
  const comVolume = linhas.map((n, i) => (n >= media * 0.2 ? i + 1 : 0)).filter(Boolean);
  let ultimoCompleto = 0;
  for (let i = 0; i < 12 && completude[i] >= COMPLETUDE_MINIMA && linhas[i] > 0; i++) ultimoCompleto = i + 1;
  return {
    year: ano,
    first_month: comVolume[0] ?? 0,
    last_month: comVolume.at(-1) ?? 0,
    last_complete_month: ultimoCompleto,
    months_covered: ultimoCompleto,
    complete: ultimoCompleto === 12,
    completude_por_mes: completude.map((x) => Number(x.toFixed(4))),
    linhas_por_mes: linhas,
  };
}

// ------------------------------------------------------------------------------------------ grade

export function gradeDoMunicipio(): Map<number, Set<string>> {
  const grade = new Map<number, Set<string>>(RESOLUTIONS.map((r) => [r, new Set<string>()]));
  for (const f of readGeoSampa('distritos'))
    for (const poly of f.geometry.coordinates)
      for (const res of RESOLUTIONS)
        for (const h of polygonToCellsExperimental(poly, res, POLYGON_TO_CELLS_FLAGS.containmentOverlapping, true)) grade.get(res)!.add(h);
  return grade;
}

// --------------------------------------------------------------------------------------- consolidação

export interface LinhaHex {
  h3_index: string;
  year: number;
  resolution: number;
  area_km2: number;
  score: number;
  level: number;
  counts: Record<string, unknown>;
  weight_by_period: number[];
  total_by_period: number[];
  levels_by_period: number[];
  weight_by_hour: number[];
  total_by_hour: number[];
  levels_by_hour: number[];
  weight_by_month: number[];
  total_by_month: number[];
}

/** Local de evento num ano (tabela event_venues). */
export interface LocalEventoAno {
  name: string;
  lat: number;
  lng: number;
  radius_m: number;
  /** arena = casa de eventos; rua = grandes eventos de rua (Carnaval, Parada) */
  kind: 'arena' | 'rua';
  year: number;
  /** BOs com ponto final no raio, no ano */
  bos: number;
  median_per_day: number;
  peak_threshold: number;
  peak_days: number;
  /** % dos BOs do ano que caíram nos dias de pico */
  pct_in_peak_days: number;
  /** maiores dias do ano ("AAAA-MM-DD": BOs) */
  top_days: [string, number][];
}

/** Dias de pico de cada local por ano (regra em DIA_DE_PICO), contando todos os dias do ano até o último mês com dados. */
export function locaisDeEvento(cidade: Record<string, CidadeAno>, ultimoMes: string): LocalEventoAno[] {
  const out: LocalEventoAno[] = [];
  for (const ano of Object.keys(cidade).map(Number).sort()) {
    const ultimo = Number(ultimoMes.slice(0, 4)) === ano ? new Date(Date.UTC(ano, Number(ultimoMes.slice(5, 7)), 0)) : new Date(Date.UTC(ano, 11, 31));
    const dias: string[] = [];
    for (let d = new Date(Date.UTC(ano, 0, 1)); d <= ultimo; d.setUTCDate(d.getUTCDate() + 1)) dias.push(d.toISOString().slice(0, 10));
    for (const v of LOCAIS_DE_EVENTO) {
      const m = cidade[ano].eventos?.[v.nome] ?? {};
      const serie = dias.map((d) => m[d] ?? 0).sort((a, b) => a - b);
      const med = serie.length ? serie[serie.length >> 1] : 0;
      const limite = Math.max(DIA_DE_PICO.minimo, DIA_DE_PICO.vezesMediana * med);
      const bos = serie.reduce((a, b) => a + b, 0);
      const picos = Object.entries(m).filter(([, n]) => n >= limite);
      out.push({
        name: v.nome,
        lat: v.lat,
        lng: v.lng,
        radius_m: v.raioM,
        kind: v.tipo,
        year: ano,
        bos,
        median_per_day: med,
        peak_threshold: limite,
        peak_days: picos.length,
        pct_in_peak_days: bos ? Number(((100 * picos.reduce((a, [, n]) => a + n, 0)) / bos).toFixed(1)) : 0,
        top_days: Object.entries(m).sort((a, b) => b[1] - a[1]).slice(0, 5),
      });
    }
  }
  return out;
}

export interface Invariante {
  nome: string;
  ok: boolean;
  detalhe: string;
}

const r3 = (x: number) => Number(x.toFixed(3));
const r4 = (x: number) => Number(x.toFixed(4));
const quase = (a: number, b: number, tol = 1e-6) => Math.abs(a - b) <= tol * Math.max(1, Math.abs(a), Math.abs(b));

export interface ResultadoConsolidacao {
  nome: string;
  pasta: string;
  linhas: LinhaHex[];
  cortes: Record<number, number[]>;
  datasets: (Cobertura & Record<string, unknown>)[];
  curva: CurvaDeAtraso;
  eventos: LocalEventoAno[];
  invariantes: Invariante[];
  relatorio: Record<string, unknown>;
  segundos: number;
}

export async function consolidar(
  proc: ResultadoProcessamento,
  regras: Regras,
  opcoes: { nome: string; escala?: Escala; anualizacao?: Anualizacao; conferirSequencial?: number; gravarArquivos?: boolean } = { nome: 'linha_de_base' },
): Promise<ResultadoConsolidacao> {
  const inicio = Date.now();
  const escala = opcoes.escala ?? 'fixa';
  const anualizacao = opcoes.anualizacao ?? 'sazonal';
  const parciais: Parcial[] = proc.parciais.map((f) => JSON.parse(fs.readFileSync(f, 'utf-8')));
  const { agregado, cidade, global } = somarParciais(parciais);
  const curva = curvaDeAtraso(cidade);
  const anos = Object.keys(cidade).map(Number).sort();
  const cob = new Map(anos.map((a) => [a, cobertura(a, cidade[a], curva)]));
  const grade = gradeDoMunicipio();

  // Fatores da cidade por ano (resolução 8): peso total ÷ peso com período / com hora.
  const fator: Record<number, { periodo: number; hora: number; pesoTotal: number; pesoComPeriodo: number; pesoComHora: number }> = {};
  for (const ano of anos) {
    let t = 0;
    let p = 0;
    let h = 0;
    for (const [k, c] of agregado) {
      const { res, ano: a } = lerChave(k);
      if (res !== 8 || a !== ano) continue;
      t += c.weight;
      p += c.weightByPeriod.reduce((x, y) => x + y, 0);
      h += c.weightByHour.reduce((x, y) => x + y, 0);
    }
    fator[ano] = { periodo: p ? t / p : 1, hora: h ? t / h : 1, pesoTotal: t, pesoComPeriodo: p, pesoComHora: h };
  }

  // Anualização do ano parcial: fração do peso anual que cai nos meses 1..L (média dos anos completos).
  const completos = anos.filter((a) => cob.get(a)!.complete);
  const pesoPorMes: Record<number, number[]> = {};
  for (const [k, c] of agregado) {
    const { res, ano } = lerChave(k);
    if (res !== 8) continue;
    const m = (pesoPorMes[ano] ??= Array(12).fill(0));
    c.weightByMonth.forEach((w, i) => (m[i] += w));
  }
  const fracaoAteMes = (L: number) => {
    const fr = completos.map((a) => somaDosMeses(pesoPorMes[a], L) / pesoPorMes[a].reduce((x, y) => x + y, 0));
    return { media: fr.reduce((x, y) => x + y, 0) / Math.max(1, fr.length), porAno: Object.fromEntries(completos.map((a, i) => [a, r4(fr[i])])) };
  };
  const fatorDoAno = new Map<number, number>();
  const anualizacaoPorAno: Record<number, { meses: number; fatorLinear: number; fracaoMedia?: number; fracaoPorAno?: Record<string, number>; fator: number }> = {};
  for (const ano of anos) {
    const L = cob.get(ano)!.months_covered || 12;
    if (L === 12) {
      fatorDoAno.set(ano, 1);
      anualizacaoPorAno[ano] = { meses: 12, fatorLinear: 1, fator: 1 };
      continue;
    }
    const fr = fracaoAteMes(L);
    const f = anualizacao === 'sazonal' && completos.length ? 1 / fr.media : fatorAnual(L);
    fatorDoAno.set(ano, f);
    anualizacaoPorAno[ano] = { meses: L, fatorLinear: r4(fatorAnual(L)), fracaoMedia: r4(fr.media), fracaoPorAno: fr.porAno, fator: r4(f) };
  }

  // Densidade anualizada do dia inteiro (só os meses completos do ano parcial).
  const area = new Map<string, number>();
  const areaDe = (h: string) => area.get(h) ?? (area.set(h, cellArea(h, 'km2')), area.get(h)!);
  const densidade = (h: string, c: Celula, ano: number) => {
    const L = cob.get(ano)!.months_covered || 12;
    return (somaDosMeses(c.weightByMonth, L) * fatorDoAno.get(ano)!) / areaDe(h);
  };

  // Cortes: escala fixa = hexágono × ano dos anos completos juntos; por_ano = só o próprio ano (comparação).
  const cortesDe = (res: number, filtro: (ano: number) => boolean) =>
    levelBreaks(
      [...agregado]
        .map(([k, c]) => ({ ...lerChave(k), c }))
        .filter((x) => x.res === res && filtro(x.ano) && x.c.total > 0)
        .map((x) => densidade(x.h3, x.c, x.ano)),
    );
  const cortesFixos = Object.fromEntries(RESOLUTIONS.map((r) => [r, cortesDe(r, (a) => completos.includes(a))])) as Record<number, number[]>;
  const cortesPorAno = new Map<string, number[]>();
  const cortes = (res: number, ano: number) => {
    if (escala === 'fixa') return cortesFixos[res];
    const k = `${res}|${ano}`;
    if (!cortesPorAno.has(k)) cortesPorAno.set(k, cortesDe(res, (a) => a === ano));
    return cortesPorAno.get(k)!;
  };

  const linhas: LinhaHex[] = [];
  const niveis: Record<string, Record<number, number[]>> = {};
  const foraDaGrade: string[] = [];
  const desvioPeriodo: number[] = [];
  const desvioHora: number[] = [];
  // Média dos 4 períodos (e das 24 horas) × dia inteiro, por resolução: desvio da densidade e diferença de nível.
  const vsDia = new Map<number, { n: number; dp: number[]; dh: number[]; nivelP: number; nivelH: number; ate1P: number; ate1H: number }>(
    RESOLUTIONS.map((r) => [r, { n: 0, dp: [], dh: [], nivelP: 0, nivelH: 0, ate1P: 0, ate1H: 0 }]),
  );
  for (const [k, c] of agregado) {
    const { res, h3, ano } = lerChave(k);
    if (c.total === 0 && c.weight === 0) continue;
    if (!grade.get(res)!.has(h3) && c.total > 0) foraDaGrade.push(k);
    const L = cob.get(ano)!.months_covered || 12;
    const a = areaDe(h3);
    const d = densidade(h3, c, ano);
    // O ano parcial usa só os meses completos: escala os períodos/horas pela fração do peso nesses meses.
    const escalaHex = c.weight > 0 ? (somaDosMeses(c.weightByMonth, L) / c.weight) * fatorDoAno.get(ano)! : 0;
    const br = cortes(res, ano);
    const level = levelFor(d, br);
    const dp = densidadesPorPeriodo(c.weightByPeriod, a, fator[ano].periodo, escalaHex);
    const dh = densidadesPorHora(c.weightByHour, a, fator[ano].hora, escalaHex);
    if (c.total > 0 && d > 0) {
      const ep = dp.reduce((x, y) => x + y, 0) / 4 / d - 1;
      const eh = dh.reduce((x, y) => x + y, 0) / 24 / d - 1;
      desvioPeriodo.push(ep);
      desvioHora.push(eh);
      const v = vsDia.get(res)!;
      const lp = dp.map((x) => levelFor(x, br)).reduce((x, y) => x + y, 0) / 4 - level;
      const lh = dh.map((x) => levelFor(x, br)).reduce((x, y) => x + y, 0) / 24 - level;
      v.n++;
      v.dp.push(ep);
      v.dh.push(eh);
      v.nivelP += lp;
      v.nivelH += lh;
      if (Math.abs(lp) <= 1) v.ate1P++;
      if (Math.abs(lh) <= 1) v.ate1H++;
    }
    linhas.push({
      h3_index: h3,
      year: ano,
      resolution: res,
      area_km2: r4(a),
      score: r4(d),
      level,
      counts: {
        total: c.total,
        peso: r3(c.weight),
        ...c.byCategory,
        ...(Object.keys(c.distributed).length ? { distribuido_pelo_distrito: Object.fromEntries(Object.entries(c.distributed).map(([x, v]) => [x, r3(v!)])) } : {}),
        sem_periodo: c.semPeriodo,
        sem_hora: c.semHora,
        geocodificado: c.geocodificado,
        trocado: c.trocado ?? 0,
        por_periodo: Object.fromEntries(PERIODOS.map((p, i) => [p, c.byPeriod[i]])),
      },
      weight_by_period: c.weightByPeriod.map(r3),
      total_by_period: c.totalByPeriod,
      levels_by_period: dp.map((x) => levelFor(x, br)),
      weight_by_hour: c.weightByHour.map(r3),
      total_by_hour: c.totalByHour,
      levels_by_hour: dh.map((x) => levelFor(x, br)),
      weight_by_month: c.weightByMonth.map(r3),
      total_by_month: c.totalByMonth,
    });
  }
  // Hexágonos por nível em cada ano (grade completa: sem BO = nível 1).
  const nivelDe = new Map(linhas.map((l) => [`${l.resolution}|${l.h3_index}|${l.year}`, l.level]));
  for (const ano of anos)
    for (const res of RESOLUTIONS) {
      const cont = Array(TOTAL_NIVEIS).fill(0);
      for (const h of grade.get(res)!) cont[(nivelDe.get(`${res}|${h}|${ano}`) ?? 1) - 1]++;
      (niveis[ano] ??= {})[res] = cont;
    }

  // ---------------------------------------------------------------------------------- invariantes
  const inv: Invariante[] = [];
  const add = (nome: string, ok: boolean, detalhe: string) => inv.push({ nome, ok, detalhe });
  const somaRes = (ano: number, f: (c: Celula) => number) =>
    RESOLUTIONS.map((r) => [...agregado].filter(([k]) => k.startsWith(`${r}|`) && k.endsWith(`|${ano}`)).reduce((s, [, c]) => s + f(c), 0));
  for (const ano of anos) {
    const tot = somaRes(ano, (c) => c.total);
    add(`${ano}: total igual nas resoluções 7/8/9`, tot.every((t) => t === tot[0]), tot.join(' / '));
    add(`${ano}: total = BOs com ponto`, tot[0] === cidade[ano].pontos, `${tot[0]} = ${cidade[ano].pontos}`);
    const dist = somaRes(ano, (c) => Object.values(c.distributed).reduce((x, y) => x + (y ?? 0), 0));
    add(`${ano}: distribuídos (frações) somam os BOs distribuídos`, dist.every((x) => quase(x, cidade[ano].distribuidos, 1e-6)), `${dist.map(r3).join(' / ')} ≈ ${cidade[ano].distribuidos}`);
    const pesos = somaRes(ano, (c) => c.weight);
    add(`${ano}: peso igual nas resoluções 7/8/9`, pesos.every((p) => quase(p, pesos[0], 1e-9)), pesos.map(r3).join(' / '));
    const c = cidade[ano];
    add(
      `${ano}: linhas = pontos + distribuídos + sem localização`,
      c.linhas === c.pontos + c.distribuidos + Object.values(c.semLocalizacao).reduce((x, y) => x + y, 0),
      `${c.linhas} = ${c.pontos} + ${c.distribuidos} + ${JSON.stringify(c.semLocalizacao)}`,
    );
    // Geocodificação: BOs com ponto = com coordenada da SSP + preenchidos + trocados − removidos
    // (removidos = ponto padrão + fora do município + pontos suspeitos que foram trocados).
    const g = c.geo;
    const soma = (o: Record<string, number>) => Object.values(o).reduce((x, y) => x + y, 0);
    const preench = soma(g.preenchidos);
    const troc = soma(g.trocados);
    const remov = g.removidos.pontoPadrao + g.removidos.pontoForaDoMunicipio + g.removidos.trocados;
    add(
      `${ano}: BOs com ponto = SSP + preenchidos + trocados − removidos`,
      c.pontos === g.comCoordenadaSsp + preench + troc - remov,
      `${c.pontos} = ${g.comCoordenadaSsp} + ${preench} + ${troc} − ${remov}`,
    );
    const geoHex = somaRes(ano, (x) => x.geocodificado);
    const trocHex = somaRes(ano, (x) => x.trocado ?? 0);
    add(`${ano}: hexágonos somam os preenchidos e os trocados`, geoHex.every((x) => x === preench) && trocHex.every((x) => x === troc), `${geoHex.join('/')} = ${preench}; ${trocHex.join('/')} = ${troc}`);
    add(`${ano}: nenhum sigilo ou BO sensível geocodificado`, g.violacoes.sigiloOuSensivelGeocodificado === 0, `${g.violacoes.sigiloOuSensivelGeocodificado}`);
    add(`${ano}: nenhum ponto final fora do município`, g.violacoes.pontoFinalForaDoMunicipio === 0, `${g.violacoes.pontoFinalForaDoMunicipio}`);
  }
  let erroPer = 0;
  let erroHora = 0;
  let erroMes = 0;
  let erroPeso = 0;
  let erroHoraPeriodo = 0;
  for (const c of agregado.values()) {
    const sp = c.totalByPeriod.reduce((a, b) => a + b, 0);
    const sh = c.totalByHour.reduce((a, b) => a + b, 0);
    const sm = c.totalByMonth.reduce((a, b) => a + b, 0);
    if (sp + c.semPeriodo !== c.total) erroPer++;
    if (sh + c.semHora !== c.total) erroHora++;
    if (sm !== c.total) erroMes++;
    const wp = c.weightByPeriod.reduce((a, b) => a + b, 0) + c.weightSemPeriodo;
    const wh = c.weightByHour.reduce((a, b) => a + b, 0) + c.weightSemHora;
    const wm = c.weightByMonth.reduce((a, b) => a + b, 0);
    if (!quase(wp, c.weight) || !quase(wh, c.weight) || !quase(wm, c.weight)) erroPeso++;
    // Período calculado pela hora: BOs com hora de cada período ≤ total do período (o resto é "só período").
    PERIODOS.forEach((_, p) => {
      const comHora = c.totalByHour.slice(p * 6, p * 6 + 6).reduce((a, b) => a + b, 0);
      if (comHora > c.totalByPeriod[p]) erroHoraPeriodo++;
    });
  }
  add('soma dos 4 períodos + sem período = total (cada hexágono)', !erroPer, `${erroPer} hexágonos com erro`);
  add('soma das 24 horas + sem hora = total (cada hexágono)', !erroHora, `${erroHora} hexágonos com erro`);
  add('soma dos 12 meses = total (cada hexágono)', !erroMes, `${erroMes} hexágonos com erro`);
  add('pesos por período / hora / mês somam o peso (cada hexágono)', !erroPeso, `${erroPeso} hexágonos com erro`);
  add('período calculado pela hora = período gravado', !erroHoraPeriodo, `${erroHoraPeriodo} casos com mais BOs com hora do que no período`);
  const mediana = (xs: number[]) => (xs.length ? [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)] : 0);
  for (const ano of anos) {
    const f = fator[ano];
    const mediaPeriodos = (f.pesoComPeriodo * f.periodo) / f.pesoTotal;
    const mediaHoras = (f.pesoComHora * f.hora) / f.pesoTotal;
    add(`${ano}: média dos 4 períodos = dia inteiro (cidade)`, quase(mediaPeriodos, 1, 1e-9), `razão ${mediaPeriodos.toFixed(6)}`);
    add(`${ano}: média das 24 horas = dia inteiro (cidade)`, quase(mediaHoras, 1, 1e-9), `razão ${mediaHoras.toFixed(6)}`);
  }
  const absMed = (xs: number[]) => mediana(xs.map(Math.abs));
  add('média dos 4 períodos ≈ dia inteiro (mediana por hexágono, |desvio| < 10%)', absMed(desvioPeriodo) < 0.1, `mediana do |desvio| = ${(100 * absMed(desvioPeriodo)).toFixed(1)}%`);
  add('média das 24 horas ≈ dia inteiro (mediana por hexágono, |desvio| < 20%)', absMed(desvioHora) < 0.2, `mediana do |desvio| = ${(100 * absMed(desvioHora)).toFixed(1)}%`);
  add('nenhum hexágono com BO fora da grade', !foraDaGrade.length, `${foraDaGrade.length} fora (${foraDaGrade.slice(0, 3).join(', ')})`);
  let minN = Infinity;
  let maxN = -Infinity;
  for (const l of linhas)
    for (const n of [l.level, ...l.levels_by_period, ...l.levels_by_hour]) {
      if (n < minN) minN = n;
      if (n > maxN) maxN = n;
    }
  add('níveis entre 1 e 10', minN >= 1 && maxN <= 10, `mín ${minN}, máx ${maxN}`);
  if (escala === 'fixa')
    add('mesmos cortes em todos os anos', RESOLUTIONS.every((r) => anos.every((a) => cortes(r, a) === cortesFixos[r])), `cortes dos anos ${completos.join(', ')}`);
  const manifesto = lerManifesto();
  const partesManifesto = Object.values(manifesto.arquivos).reduce((s, a) => s + a.partes.length, 0);
  const linhasManifesto = Object.values(manifesto.arquivos).reduce((s, a) => s + a.mantidas, 0);
  add('partes processadas = partes do manifesto', parciais.length === partesManifesto, `${parciais.length} = ${partesManifesto}`);
  add('linhas processadas = linhas mantidas na limpeza', global.linhasLidas === linhasManifesto, `${global.linhasLidas} = ${linhasManifesto}`);
  add(
    'linhas lidas = excluídas pela deduplicação + sem data + fora dos anos + linhas dos anos',
    global.linhasLidas ===
      global.linhasExcluidasPelaDeduplicacao + global.semDataDeOcorrencia + Object.values(global.foraDosAnos).reduce((a, b) => a + b, 0) + anos.reduce((s, a) => s + cidade[a].linhas, 0),
    'balanço das linhas',
  );
  // Paralelo = sequencial: reprocessa algumas partes aqui mesmo, em sequência, e compara com a parcial do pool.
  if (opcoes.conferirSequencial) {
    const municipio = carregarMunicipio();
    const hexDoDistrito = hexagonosDosDistritos();
    const geocodificar = geocodificadorDoCache(regras) ?? undefined;
    const amostra = parciais.filter((_, i) => i % Math.max(1, Math.floor(parciais.length / opcoes.conferirSequencial!)) === 0).slice(0, opcoes.conferirSequencial);
    let iguais = 0;
    for (const p of amostra) {
      const parte = proc.partes.find((x) => x.arquivo === p.parte)!;
      const bruto = zlib.gunzipSync(fs.readFileSync(path.join(pastaLimpo(), parte.arquivo))).toString('utf-8').split('\n').slice(1).filter(Boolean);
      const r = processarLinhas(bruto.map(lerLinhaCsv), regras, { excluir: new Set(proc.excluir[p.parte] ?? []), distritoDe: municipio.distritoDe, hexDoDistrito, geocodificar });
      const seq = JSON.stringify({ agregado: Object.fromEntries(r.agregado), cidade: r.cidade, global: r.global });
      if (seq === JSON.stringify({ agregado: p.agregado, cidade: p.cidade, global: p.global })) iguais++;
    }
    add('paralelo = sequencial (partes reprocessadas em sequência)', iguais === amostra.length, `${iguais}/${amostra.length} partes idênticas`);
  }

  const media = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);
  const periodosVsDia = Object.fromEntries(
    [...vsDia].map(([res, v]) => [
      res,
      {
        hexagonos_ano: v.n,
        periodos: {
          desvio_medio_densidade_pct: Number((100 * media(v.dp)).toFixed(2)),
          mediana_abs_desvio_pct: Number((100 * mediana(v.dp.map(Math.abs))).toFixed(2)),
          diferenca_media_de_nivel: Number((v.nivelP / Math.max(1, v.n)).toFixed(3)),
          ate_1_nivel_pct: Number(((100 * v.ate1P) / Math.max(1, v.n)).toFixed(1)),
        },
        horas: {
          desvio_medio_densidade_pct: Number((100 * media(v.dh)).toFixed(2)),
          mediana_abs_desvio_pct: Number((100 * mediana(v.dh.map(Math.abs))).toFixed(2)),
          diferenca_media_de_nivel: Number((v.nivelH / Math.max(1, v.n)).toFixed(3)),
          ate_1_nivel_pct: Number(((100 * v.ate1H) / Math.max(1, v.n)).toFixed(1)),
        },
      },
    ]),
  );
  const eventos = locaisDeEvento(cidade, curva.corte);
  const resumoEventos = LOCAIS_DE_EVENTO.map((v) => {
    const xs = eventos.filter((e) => e.name === v.nome);
    const bos = xs.reduce((a, e) => a + e.bos, 0);
    const emPico = xs.reduce((a, e) => a + (e.bos * e.pct_in_peak_days) / 100, 0);
    const dias = xs.reduce((a, e) => a + e.peak_days, 0);
    const pct = bos ? (100 * emPico) / bos : 0;
    return { nome: v.nome, bos, dias_de_pico: dias, pct_em_dias_de_pico: Number(pct.toFixed(1)), fica: dias >= MANTER_LOCAL.minDias && pct >= MANTER_LOCAL.minPct };
  });
  const sigilo = Object.fromEntries(
    anos.map((ano) => {
      const c = cidade[ano];
      const tot = Object.values(c.porCategoria).reduce((a, b) => a + (b ?? 0), 0);
      const sg = Object.values(c.sigiloPorCategoria ?? {}).reduce((a, b) => a + (b ?? 0), 0);
      return [
        ano,
        {
          total_pct: Number(((100 * sg) / Math.max(1, tot)).toFixed(2)),
          por_categoria: Object.fromEntries(
            Object.entries(c.porCategoria).map(([cat, n]) => [cat, { bos: n, sigilo: c.sigiloPorCategoria?.[cat as keyof typeof c.porCategoria] ?? 0, pct: Number(((100 * (c.sigiloPorCategoria?.[cat as keyof typeof c.porCategoria] ?? 0)) / Math.max(1, n ?? 0)).toFixed(1)) }]),
          ),
        },
      ];
    }),
  );

  const datasets = anos.map((ano) => {
    const c = cidade[ano];
    const cv = cob.get(ano)!;
    return {
      ...cv,
      rows_valid: c.pontos,
      rows_distributed: c.distribuidos,
      rows_no_location: Object.values(c.semLocalizacao).reduce((a, b) => a + b, 0),
      rows_geocoded: Object.values(c.geo.preenchidos).reduce((a, b) => a + b, 0),
      rows_swapped: Object.values(c.geo.trocados).reduce((a, b) => a + b, 0),
      rows_no_hour: c.pontos - c.horario.hora,
      source_files: Object.values(manifesto.arquivos).map((a) => a.origem),
    };
  });

  const relatorio = {
    nome: opcoes.nome,
    escala,
    regras,
    hashProcessamento: proc.hash,
    global,
    indiceDeBos: proc.indice,
    curvaDeAtraso: curva,
    datasets,
    fatores: fator,
    anualizacao: { modo: anualizacao, porAno: anualizacaoPorAno },
    cortes: escala === 'fixa' ? cortesFixos : Object.fromEntries(cortesPorAno),
    quantis: QUANTIS_DOS_CORTES,
    hexagonosPorNivel: niveis,
    periodosVsDia,
    eventos: { regra: DIA_DE_PICO, manter: MANTER_LOCAL, resumo: resumoEventos },
    sigilo,
    cidade: Object.fromEntries(anos.map((a) => [a, { ...cidade[a], atraso: undefined, eventos: undefined }])),
    invariantes: inv,
  };
  const pasta = path.join(outDir, 'consolidado', opcoes.nome);
  if (opcoes.gravarArquivos !== false) {
    fs.mkdirSync(pasta, { recursive: true });
    fs.writeFileSync(path.join(pasta, 'hex_stats.ndjson.gz'), zlib.gzipSync(linhas.map((l) => JSON.stringify(l)).join('\n')));
    fs.writeFileSync(path.join(pasta, 'level_breaks.json'), JSON.stringify(cortesFixos, null, 2));
    fs.writeFileSync(path.join(pasta, 'datasets.json'), JSON.stringify(datasets, null, 2));
    fs.writeFileSync(path.join(pasta, 'event_venues.json'), JSON.stringify(eventos, null, 2));
    fs.writeFileSync(path.join(pasta, 'relatorio.json'), JSON.stringify(relatorio, null, 2));
  }
  return { nome: opcoes.nome, pasta, linhas, cortes: cortesFixos, datasets, curva, eventos, invariantes: inv, relatorio, segundos: Math.round((Date.now() - inicio) / 1000) };
}


