/**
 * Linhas que vão para o Supabase (Etapa 5), montadas a partir da saída final da consolidação
 * (scripts/out/consolidado/final/). Funções puras: o script de gravação (gravar.ts) e os testes usam as mesmas.
 */
import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import { cellArea } from 'h3-js';
import { outDir } from '../lib/paths';
import type { LinhaHex, LocalEventoAno } from './consolidacao';

export const pastaFinal = () => path.join(outDir, 'consolidado', 'final');

export interface SaidaFinal {
  datasets: Record<string, any>[];
  cortes: Record<string, number[]>;
  hex: LinhaHex[];
  eventos: LocalEventoAno[];
  relatorio: Record<string, any>;
  /** data de modificação mais recente dos arquivos (para conferir que a verificação é posterior) */
  modificadoEm: number;
}

export function lerSaidaFinal(pasta = pastaFinal()): SaidaFinal {
  const arq = (f: string) => path.join(pasta, f);
  const nomes = ['datasets.json', 'level_breaks.json', 'hex_stats.ndjson.gz', 'event_venues.json', 'relatorio.json'];
  for (const f of nomes) if (!fs.existsSync(arq(f))) throw new Error(`Falta ${arq(f)}: rode npm run data:consolidar.`);
  const hex = zlib
    .gunzipSync(fs.readFileSync(arq('hex_stats.ndjson.gz')))
    .toString('utf-8')
    .split('\n')
    .filter(Boolean)
    .map((l) => JSON.parse(l) as LinhaHex);
  return {
    datasets: JSON.parse(fs.readFileSync(arq('datasets.json'), 'utf-8')),
    cortes: JSON.parse(fs.readFileSync(arq('level_breaks.json'), 'utf-8')),
    hex,
    eventos: JSON.parse(fs.readFileSync(arq('event_venues.json'), 'utf-8')),
    relatorio: JSON.parse(fs.readFileSync(arq('relatorio.json'), 'utf-8')),
    modificadoEm: Math.max(...nomes.map((f) => fs.statSync(arq(f)).mtimeMs)),
  };
}

/** Ano padrão do app: o ano completo mais recente (a mesma regra das funções do banco). */
export const anoPadrao = (s: Pick<SaidaFinal, 'datasets'>) => Math.max(...s.datasets.filter((d) => d.complete).map((d) => d.year as number));

type Sigilo = Record<string, { total_pct: number; por_categoria: Record<string, { bos: number; sigilo: number; pct: number }> }>;

/** "cerca de 1/3", "4 em cada 10", "todos os": a forma mais fácil de ler uma porcentagem. */
export function proporcaoEmTexto(pct: number): string {
  if (pct >= 99.5) return 'todos os';
  for (const [f, v] of [['metade', 50], ['1/3', 100 / 3], ['1/4', 25], ['2/3', 200 / 3], ['3/4', 75]] as const)
    if (Math.abs(pct - v) <= 2.5) return f === 'metade' ? 'cerca de metade dos' : `cerca de ${f} dos`;
  const em10 = Math.round(pct / 10);
  return em10 >= 1 ? `${em10} em cada 10` : `${Math.round(pct)}% dos`;
}

/**
 * BOs sem localização divulgada pela SSP (sigilo), somando todos os anos: a frase fixa do relatório e da tela
 * "Como ler estes dados". Os números vêm do relatório da consolidação, não do texto.
 */
export function fraseSigilo(sigilo: Sigilo) {
  const soma = (cat?: string) => {
    let bos = 0;
    let sig = 0;
    for (const a of Object.values(sigilo))
      for (const [c, v] of Object.entries(a.por_categoria))
        if (!cat || c === cat) {
          bos += v.bos;
          sig += v.sigilo;
        }
    return bos ? (100 * sig) / bos : 0;
  };
  const pct = { total: soma(), estupro: soma('estupro'), homicidio_doloso: soma('homicidio_doloso'), lesao_dolosa: soma('lesao_dolosa') };
  const r = (x: number) => Math.round(x * 10) / 10;
  const texto =
    `A SSP não divulga a localização de parte dos registros (cerca de ${Math.round(pct.total)}% no total, ` +
    `${proporcaoEmTexto(pct.estupro)} estupros, ${proporcaoEmTexto(pct.homicidio_doloso)} homicídios e ` +
    `${proporcaoEmTexto(pct.lesao_dolosa).replace(/ dos$/, '')} lesões). Esses registros não aparecem no mapa.`;
  return { texto, pct: { total: r(pct.total), estupro: r(pct.estupro), homicidio_doloso: r(pct.homicidio_doloso), lesao_dolosa: r(pct.lesao_dolosa) } };
}

export function linhasDatasets(s: SaidaFinal, agora = new Date().toISOString()) {
  const sigilo = s.relatorio.sigilo as Sigilo;
  const frase = fraseSigilo(sigilo);
  return s.datasets.map((d) => {
    const f = s.relatorio.fatores[d.year];
    const a = s.relatorio.anualizacao.porAno[d.year];
    return {
      year: d.year,
      first_month: d.first_month,
      last_month: d.last_month,
      last_complete_month: d.last_complete_month,
      months_covered: d.months_covered,
      complete: d.complete,
      rows_valid: d.rows_valid,
      rows_distributed: d.rows_distributed ?? 0,
      rows_no_location: d.rows_no_location,
      rows_geocoded: d.rows_geocoded ?? 0,
      rows_swapped: d.rows_swapped ?? 0,
      rows_no_hour: d.rows_no_hour ?? 0,
      period_factor: f.periodo,
      hour_factor: f.hora,
      annual_factor: a?.fator ?? 1,
      hidden_location: {
        year_pct: {
          total: sigilo[d.year]?.total_pct ?? null,
          estupro: sigilo[d.year]?.por_categoria.estupro?.pct ?? null,
          homicidio_doloso: sigilo[d.year]?.por_categoria.homicidio_doloso?.pct ?? null,
          lesao_dolosa: sigilo[d.year]?.por_categoria.lesao_dolosa?.pct ?? null,
        },
        all_years_pct: frase.pct,
        message: frase.texto,
      },
      source_files: d.source_files ?? [],
      notes: d.complete
        ? null
        : `Ano parcial: meses 1–${d.last_complete_month} completos; nota anualizada pela sazonalidade dos anos completos (fator ${a?.fator}).`,
      imported_at: agora,
    };
  });
}

export function linhasLevelBreaks(s: SaidaFinal, agora = new Date().toISOString()) {
  const anos = s.datasets.filter((d) => d.complete).map((d) => d.year);
  return Object.entries(s.cortes).map(([res, breaks]) => ({
    resolution: Number(res),
    breaks,
    reference: `hexágonos com BO de ${anos.join(', ')} juntos (percentis 15/30/45/60/72/82/90/95/98)`,
    updated_at: agora,
  }));
}

export function linhasHexStats(s: SaidaFinal) {
  return s.hex.map(({ area_km2: _area, ...l }) => l);
}

export function linhasEventVenues(s: SaidaFinal) {
  return s.eventos.map((e) => ({
    name: e.name,
    year: e.year,
    lat: e.lat,
    lng: e.lng,
    radius_m: e.radius_m,
    kind: e.kind,
    bos: e.bos,
    median_per_day: e.median_per_day,
    peak_threshold: e.peak_threshold,
    peak_days: e.peak_days,
    pct_in_peak_days: e.pct_in_peak_days,
    top_days: e.top_days,
    geom: `SRID=4326;POINT(${e.lng} ${e.lat})`,
  }));
}

/** Área (km²) de cada hexágono da grade, a mesma do score (h3-js). */
export function areasDaGrade(grade: Map<number, Set<string>>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const hs of grade.values()) for (const h of hs) out[h] = Number(cellArea(h, 'km2').toFixed(6));
  return out;
}

/** Contagem de linhas por ano e resolução (para conferir local × banco). */
export function contagemPorAnoResolucao(linhas: Pick<LinhaHex, 'year' | 'resolution'>[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const l of linhas) out[`${l.year}|${l.resolution}`] = (out[`${l.year}|${l.resolution}`] ?? 0) + 1;
  return out;
}
