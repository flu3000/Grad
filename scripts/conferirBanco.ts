/**
 * Conferência depois da gravação (só lê o Supabase): o banco tem que bater com a saída final local.
 *
 *   npm run data:conferir-banco
 *
 *   1. linhas por ano e resolução em hex_stats = local; datasets, level_breaks e event_venues iguais;
 *   2. 20 hexágonos sorteados: todas as colunas iguais (reais com tolerância de float4);
 *   3. hex_cells: area_km2 preenchida e espelho do ano padrão igual ao local;
 *   4. hexagons_in_view (formato do app e com períodos/horas) e locate_point iguais ao local;
 *   5. address_report em 6 endereços de teste = conta independente feita aqui;
 *   6. tempo de resposta das RPCs (ida e volta; o explain analyze está em supabase/testes/desempenho.sql).
 * Sai com código 2 se algo não bater.
 */
import { cellToLatLng, latLngToCell } from 'h3-js';
import { adminClient } from './src/lib/supabase';
import { distanciaM } from './src/lib/endereco';
import { gradeDoMunicipio, type LinhaHex } from './src/pipeline/consolidacao';
import { anoPadrao, areasDaGrade, contagemPorAnoResolucao, lerSaidaFinal, linhasDatasets, linhasHexStats } from './src/pipeline/gravacao';

const LUGARES = [
  { nome: 'Sé', lat: -23.5503, lng: -46.6339 },
  { nome: 'Paulista', lat: -23.5614, lng: -46.6559 },
  { nome: 'Brás', lat: -23.544, lng: -46.616 },
  { nome: 'Itaquera', lat: -23.54, lng: -46.456 },
  { nome: 'Alto de Pinheiros', lat: -23.549, lng: -46.715 },
  { nome: 'Interlagos', lat: -23.7035, lng: -46.6985 },
];

const resultados: { ok: boolean; nome: string; detalhe: string }[] = [];
const conferir = (ok: boolean, nome: string, detalhe = '') => {
  resultados.push({ ok, nome, detalhe });
  console.log(`${ok ? '✓' : '✗'} ${nome}${detalhe ? ` — ${detalhe}` : ''}`);
};
const quase = (a: number, b: number) => Math.abs(a - b) <= 1e-5 * Math.max(1, Math.abs(a), Math.abs(b)) + 1e-4;
const arraysQuase = (a: number[], b: number[]) => a.length === b.length && a.every((x, i) => quase(x, b[i]));
const nivel = (d: number, cortes: number[]) => (d <= 0 ? 1 : 1 + cortes.filter((c) => d > c).length);

function aleatorio(semente: number) {
  let a = semente >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

async function cronometrar<T>(f: () => PromiseLike<T>): Promise<[T, number]> {
  const t0 = performance.now();
  const r = await f();
  return [r, performance.now() - t0];
}

async function main() {
  const db = adminClient();
  const s = lerSaidaFinal();
  const ano = anoPadrao(s);
  const hex = linhasHexStats(s);
  const local = new Map(s.hex.map((l) => [`${l.h3_index}|${l.year}`, l]));
  const grade = gradeDoMunicipio();
  const areas = areasDaGrade(grade);

  // 1. contagens
  const esperado = contagemPorAnoResolucao(hex);
  for (const [k, n] of Object.entries(esperado)) {
    const [y, r] = k.split('|').map(Number);
    const { count, error } = await db.from('hex_stats').select('h3_index', { count: 'exact', head: true }).eq('year', y).eq('resolution', r);
    conferir(!error && count === n, `hex_stats ${y} res ${r}`, error ? error.message : `${count} no banco, ${n} local`);
  }
  const { data: ds } = await db.from('datasets').select('*').order('year');
  const dl = linhasDatasets(s);
  const camposDs = ['first_month', 'last_month', 'last_complete_month', 'months_covered', 'complete', 'rows_valid', 'rows_no_location', 'rows_geocoded', 'rows_swapped', 'rows_no_hour'] as const;
  conferir(
    (ds ?? []).length === dl.length &&
      dl.every((d, i) => camposDs.every((c) => ds![i][c] === d[c]) && quase(ds![i].period_factor, d.period_factor) && quase(ds![i].hour_factor, d.hour_factor) && quase(ds![i].annual_factor, d.annual_factor)),
    'datasets iguais',
    (ds ?? []).map((d) => `${d.year} ${d.rows_valid} (fator ${d.annual_factor})`).join(', '),
  );
  const { data: lb } = await db.from('level_breaks').select('resolution, breaks').order('resolution');
  conferir((lb ?? []).length === 3 && lb!.every((b) => arraysQuase(b.breaks, s.cortes[String(b.resolution)])), 'level_breaks iguais');
  const { data: ev } = await db.from('event_venues').select('name, year, bos, peak_days, pct_in_peak_days');
  const evOk = s.eventos.every((e) => (ev ?? []).some((x) => x.name === e.name && x.year === e.year && x.bos === e.bos && x.peak_days === e.peak_days && quase(x.pct_in_peak_days, e.pct_in_peak_days)));
  conferir((ev ?? []).length === s.eventos.length && evOk, 'event_venues iguais', `${(ev ?? []).length} no banco, ${s.eventos.length} local`);

  // 2. 20 hexágonos sorteados
  const rnd = aleatorio(20261111);
  const sorteio = Array.from({ length: 20 }, () => hex[Math.floor(rnd() * hex.length)]);
  let iguais = 0;
  const diferencas: string[] = [];
  for (const l of sorteio) {
    const { data } = await db.from('hex_stats').select('*').eq('h3_index', l.h3_index).eq('year', l.year).single();
    const campos: (keyof Omit<LinhaHex, 'area_km2'>)[] = ['weight_by_period', 'total_by_period', 'levels_by_period', 'weight_by_hour', 'total_by_hour', 'levels_by_hour', 'weight_by_month', 'total_by_month'];
    const ok = !!data && data.level === l.level && data.resolution === l.resolution && quase(data.score, l.score) && JSON.stringify(sortear(data.counts)) === JSON.stringify(sortear(l.counts)) && campos.every((c) => arraysQuase(data[c], l[c] as number[]));
    if (ok) iguais++;
    else diferencas.push(`${l.h3_index}|${l.year}`);
  }
  conferir(iguais === 20, '20 hexágonos sorteados com todas as colunas iguais', diferencas.join(', '));

  // 3. hex_cells
  const { count: semArea } = await db.from('hex_cells').select('h3_index', { count: 'exact', head: true }).is('area_km2', null);
  conferir(semArea === 0, 'hex_cells.area_km2 preenchida em todos', `${semArea} sem área`);
  const { count: foraDoAno } = await db.from('hex_cells').select('h3_index', { count: 'exact', head: true }).neq('period', String(ano));
  conferir(foraDoAno === 0, `hex_cells espelhando ${ano}`, `${foraDoAno} com outro period`);
  const amostraCelulas = Object.keys(areas).filter((_, i) => i % 900 === 0);
  const { data: cel } = await db.from('hex_cells').select('h3_index, level, score').in('h3_index', amostraCelulas);
  const celDif = (cel ?? []).filter((c) => c.level !== (local.get(`${c.h3_index}|${ano}`)?.level ?? 1)).length;
  conferir((cel ?? []).length === amostraCelulas.length && celDif === 0, `hex_cells.level = ${ano} local (${amostraCelulas.length} hexágonos)`, `${celDif} diferentes`);

  // 4. funções do app
  const tempos: Record<string, number[]> = {};
  const marcar = (k: string, ms: number) => (tempos[k] ??= []).push(ms);
  for (const lg of LUGARES) {
    const caixa = { min_lng: lg.lng - 0.03, min_lat: lg.lat - 0.02, max_lng: lg.lng + 0.03, max_lat: lg.lat + 0.02 };
    for (const res of [7, 8, 9]) {
      const [{ data, error }, ms] = await cronometrar(() => db.rpc('hexagons_in_view', { ...caixa, res, max_cells: 2000 }));
      marcar('hexagons_in_view (app)', ms);
      const dif = ((data ?? []) as { h3_index: string; level: number }[]).filter((h) => h.level !== (local.get(`${h.h3_index}|${ano}`)?.level ?? 1)).length;
      if (error || dif) conferir(false, `hexagons_in_view ${lg.nome} res ${res}`, error?.message ?? `${dif} diferentes`);
      const [{ data: d2, error: e2 }, ms2] = await cronometrar(() => db.rpc('hexagons_in_view', { ...caixa, res, max_cells: 2000, p_year: 2026, with_periods: true, with_hours: true }));
      marcar('hexagons_in_view (2026, períodos e horas)', ms2);
      const dif2 = ((d2 ?? []) as { h3_index: string; levels_by_hour: number[] }[]).filter((h) => JSON.stringify(h.levels_by_hour) !== JSON.stringify(local.get(`${h.h3_index}|2026`)?.levels_by_hour ?? Array(24).fill(1))).length;
      if (e2 || dif2) conferir(false, `hexagons_in_view 2026 ${lg.nome} res ${res}`, e2?.message ?? `${dif2} diferentes`);
    }
    const [{ data: lp }, ms] = await cronometrar(() => db.rpc('locate_point', { lat: lg.lat, lng: lg.lng, res: 8 }));
    marcar('locate_point', ms);
    const h8 = latLngToCell(lg.lat, lg.lng, 8);
    const r = (lp ?? [])[0];
    if (!r || r.h3_index !== h8 || r.level !== (local.get(`${h8}|${ano}`)?.level ?? 1)) conferir(false, `locate_point ${lg.nome}`, JSON.stringify(r?.level));
  }
  conferir(!resultados.some((x) => !x.ok && /hexagons_in_view|locate_point/.test(x.nome)), 'hexagons_in_view e locate_point iguais ao local nos 6 lugares');

  // 5. address_report × conta independente
  const res9 = [...grade.get(9)!];
  const cortes8 = s.cortes['8'];
  for (const lg of LUGARES) {
    const [{ data: rep, error }, ms] = await cronometrar(() => db.rpc('address_report', { lat: lg.lat, lng: lg.lng, radius_m: 500 }));
    marcar('address_report', ms);
    if (error) {
      conferir(false, `address_report ${lg.nome}`, error.message);
      continue;
    }
    const hs = res9.filter((h) => {
      const [a, b] = cellToLatLng(h);
      return distanciaM(a, b, lg.lat, lg.lng) <= 500;
    });
    let area = 0;
    let soma = 0;
    let total = 0;
    for (const h of hs) {
      area += areas[h];
      const x = local.get(`${h}|${ano}`);
      if (x) {
        soma += x.score * areas[h];
        total += Number(x.counts.total);
      }
    }
    const score = area ? soma / area : 0;
    const ok = rep.hexagons === hs.length && rep.total === total && Math.abs(rep.score - score) <= 0.2 && rep.level === nivel(score, cortes8);
    conferir(ok, `address_report ${lg.nome}`, `nível ${rep.level} (local ${nivel(score, cortes8)}), ${rep.total} BOs (local ${total}), percentil ${rep.city_percentile}, ${rep.event_venues.length} aviso(s) de evento`);
  }

  // 6. tempos
  console.log('\nTempo de ida e volta (inclui a rede; o alvo do banco é address_report < 150 ms e hexagons_in_view com horas < 300 ms):');
  for (const [k, v] of Object.entries(tempos)) {
    const o = [...v].sort((a, b) => a - b);
    console.log(`  ${k}: mediana ${Math.round(o[Math.floor(o.length / 2)])} ms, máx ${Math.round(o[o.length - 1])} ms (${o.length} chamadas)`);
  }

  const falhas = resultados.filter((x) => !x.ok);
  console.log(`\n${resultados.length - falhas.length}/${resultados.length} conferências ok`);
  if (falhas.length) process.exit(2);
}

/** jsonb devolve as chaves em outra ordem: compara pelo conteúdo. */
function sortear(o: unknown): unknown {
  if (Array.isArray(o) || o === null || typeof o !== 'object') return o;
  return Object.fromEntries(Object.entries(o as Record<string, unknown>).sort(([a], [b]) => (a.length - b.length) || (a < b ? -1 : 1)).map(([k, v]) => [k, sortear(v)]));
}

main().catch((err) => {
  console.error(process.env.DEBUG && err instanceof Error ? err.stack : err instanceof Error ? err.message : err);
  process.exit(1);
});
