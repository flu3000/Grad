/**
 * Testa as migrations num Postgres local (PGlite + PostGIS, em WebAssembly), sem tocar no Supabase e sem a planilha:
 * aplica todas as migrations de supabase/migrations em ordem, carrega um recorte sintético e confere as funções.
 *
 *   npm run test:banco
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { after, before, test } from 'node:test';
import { PGlite } from '@electric-sql/pglite';
import { postgis } from '@electric-sql/pglite-postgis';
import { cellArea, cellToBoundary, cellToLatLng, cellToParent, gridDisk, latLngToCell } from 'h3-js';
import { distanciaM } from '../src/lib/endereco';
import { levelFor } from '../src/lib/scoring';
import type { LinhaHex, LocalEventoAno } from '../src/pipeline/consolidacao';
import { anoPadrao, areasDaGrade, linhasDatasets, linhasEventVenues, linhasHexStats, linhasLevelBreaks, type SaidaFinal } from '../src/pipeline/gravacao';

const MIGRATIONS = path.join(__dirname, '../../supabase/migrations');
const CENTRO = { lat: -23.5614, lng: -46.6559 };
const CORTES = [1, 50, 100, 200, 400, 800, 1600, 3200, 6400];

let db: PGlite;
let s: SaidaFinal;
let grade: Map<number, Set<string>>;
const r9 = gridDisk(latLngToCell(CENTRO.lat, CENTRO.lng, 9), 6);

/** Linha sintética de um hexágono num ano, coerente (somas de período/hora/mês = total). */
function linha(h: string, res: number, year: number, total: number, fatorAno = 1): LinhaHex {
  const area = cellArea(h, 'km2');
  const per = [0.1, 0.2, 0.3, 0.4].map((f) => Math.round(total * f));
  per[3] += total - per.reduce((a, b) => a + b, 0);
  const horas = Array.from({ length: 24 }, (_, i) => (i < total % 24 ? 1 : 0) + Math.floor(total / 24));
  const meses = Array.from({ length: 12 }, (_, i) => (i < total % 12 ? 1 : 0) + Math.floor(total / 12));
  const peso = total * 2;
  const score = (peso * fatorAno) / area;
  const dens = (w: number[], k: number) => w.map((x) => levelFor((x * k * fatorAno) / area, CORTES));
  return {
    h3_index: h,
    year,
    resolution: res,
    area_km2: area,
    score,
    level: levelFor(score, CORTES),
    counts: { total, peso, furto_outros: total - 2, estupro: 2, sem_periodo: 0, sem_hora: 0, geocodificado: 0, trocado: 0, por_periodo: { manha: { furto_outros: per[1] } } },
    weight_by_period: per.map((x) => x * 2),
    total_by_period: per,
    levels_by_period: dens(per.map((x) => x * 2), 4),
    weight_by_hour: horas.map((x) => x * 2),
    total_by_hour: horas,
    levels_by_hour: dens(horas.map((x) => x * 2), 24),
    weight_by_month: meses.map((x) => x * 2),
    total_by_month: meses,
  };
}

function evento(name: string, kind: 'arena' | 'rua', year: number, pct: number, dLat = 0): LocalEventoAno {
  return { name, kind, year, lat: CENTRO.lat + dLat, lng: CENTRO.lng, radius_m: 300, bos: 100, median_per_day: 0, peak_threshold: 10, peak_days: 3, pct_in_peak_days: pct, top_days: [] };
}

before(async () => {
  db = await PGlite.create({ extensions: { postgis } });
  await db.exec(`create schema extensions; create role anon; create role authenticated; create role service_role;`);
  for (const f of fs.readdirSync(MIGRATIONS).filter((f) => f.endsWith('.sql')).sort()) await db.exec(fs.readFileSync(path.join(MIGRATIONS, f), 'utf-8'));
  await db.exec(`grant usage on schema public, extensions to anon, authenticated, service_role;
    grant select on all tables in schema public to anon, authenticated;
    grant all on all tables in schema public to service_role;`);

  const r8 = [...new Set(r9.map((h) => cellToParent(h, 8)))];
  const r7 = [...new Set(r9.map((h) => cellToParent(h, 7)))];
  grade = new Map([[7, new Set(r7)], [8, new Set(r8)], [9, new Set(r9)]]);
  for (const [res, hs] of grade)
    for (const h of hs) {
      const b = cellToBoundary(h).map(([a, c]) => `${c} ${a}`);
      await db.query(`insert into public.hex_cells (h3_index, resolution, geom, score, level, counts, period) values ($1, $2, $3::extensions.geometry, 7, 4, '{"total": 1, "peso": 1}', '2025')`, [h, res, `SRID=4326;POLYGON((${[...b, b[0]].join(',')}))`]);
    }
  const area = 'SRID=4326;MULTIPOLYGON(((-46.8 -23.7,-46.5 -23.7,-46.5 -23.4,-46.8 -23.4,-46.8 -23.7)))';
  await db.query(`insert into public.subprefectures values (1, '1', 'Sub', 'S', 1, $1)`, [area]);
  await db.query(`insert into public.districts values (1, '1', 'Distrito', 'D', 1, 1, $1)`, [area]);
  await db.exec(`insert into public.security_units (id, kind, name, geom) values (1, 'policia_militar', 'PM', 'SRID=4326;POINT(-46.6560 -23.5650)')`);

  // 2024 e 2025 completos, 2026 parcial (anualizado 1,5); um hexágono sem BO em 2025 (linha ausente = nível 1)
  const hex: LinhaHex[] = [];
  r9.forEach((h, i) => {
    hex.push(linha(h, 9, 2024, 10 + i));
    if (i !== 0) hex.push(linha(h, 9, 2025, 20 + i));
    hex.push(linha(h, 9, 2026, 5 + i, 1.5));
  });
  for (const h of [...r8, ...r7]) for (const y of [2024, 2025, 2026]) hex.push(linha(h, r8.includes(h) ? 8 : 7, y, 500, y === 2026 ? 1.5 : 1));
  const ds = (year: number, complete: boolean) => ({ year, first_month: 1, last_month: complete ? 12 : 9, last_complete_month: complete ? 12 : 8, months_covered: complete ? 12 : 8, complete, rows_valid: 1, rows_no_location: 0, source_files: [] });
  const sig = (pct: number) => ({ total_pct: 8, por_categoria: { estupro: { bos: 10, sigilo: 10, pct: 100 }, homicidio_doloso: { bos: 3, sigilo: 1, pct }, lesao_dolosa: { bos: 10, sigilo: 4, pct: 40 }, furto_outros: { bos: 167, sigilo: 0, pct: 0 } } });
  s = {
    datasets: [ds(2024, true), ds(2025, true), ds(2026, false)],
    cortes: { 7: CORTES, 8: CORTES, 9: CORTES },
    hex,
    eventos: [evento('Arena perto', 'arena', 2025, 40), evento('Rua perto', 'rua', 2025, 20, 0.002), evento('Arena fraca', 'arena', 2025, 10, -0.002), evento('Arena perto', 'arena', 2024, 5)],
    relatorio: {
      fatores: { 2024: { periodo: 1, hora: 1 }, 2025: { periodo: 1, hora: 1 }, 2026: { periodo: 1, hora: 1 } },
      anualizacao: { porAno: { 2024: { fator: 1 }, 2025: { fator: 1 }, 2026: { fator: 1.5 } } },
      sigilo: { 2024: sig(33.3), 2025: sig(33.3), 2026: sig(33.3) },
    },
    modificadoEm: 0,
  };
});

after(async () => {
  await db?.close();
});

const rpc = async <T = Record<string, unknown>>(sql: string, p: unknown[] = []) => (await db.query<T>(sql, p)).rows;
const CAIXA = [CENTRO.lng - 0.02, CENTRO.lat - 0.02, CENTRO.lng + 0.02, CENTRO.lat + 0.02];

test('antes da primeira gravação, hexagons_in_view e locate_point usam o nível de hex_cells', async () => {
  const h = await rpc<{ level: number; score: number }>(`select * from public.hexagons_in_view($1, $2, $3, $4, 9, 2000)`, CAIXA);
  assert.equal(h.length, r9.length);
  assert.ok(h.every((x) => x.level === 4 && x.score === 7));
  const [l] = await rpc<{ level: number; year: number | null }>(`select * from public.locate_point($1, $2, 9)`, [CENTRO.lat, CENTRO.lng]);
  assert.equal(l.level, 4);
  assert.equal(l.year, null);
});

test('gravação: linhas montadas entram nas tabelas e o espelho copia o ano padrão', async () => {
  for (const d of linhasDatasets(s)) await db.query(`insert into public.datasets select * from jsonb_populate_record(null::public.datasets, $1::jsonb)`, [JSON.stringify(d)]);
  for (const b of linhasLevelBreaks(s)) await db.query(`insert into public.level_breaks select * from jsonb_populate_record(null::public.level_breaks, $1::jsonb)`, [JSON.stringify(b)]);
  await db.query(`insert into public.hex_stats select * from jsonb_populate_recordset(null::public.hex_stats, $1::jsonb)`, [JSON.stringify(linhasHexStats(s))]);
  for (const e of linhasEventVenues(s)) await db.query(`insert into public.event_venues select * from jsonb_populate_record(null::public.event_venues, $1::jsonb)`, [JSON.stringify(e)]);
  const [a] = await rpc<{ n: number }>(`select public.set_hex_cell_areas($1::jsonb) n`, [JSON.stringify(areasDaGrade(grade))]);
  const total = [...grade.values()].reduce((x, g) => x + g.size, 0);
  assert.equal(a.n, total);
  assert.equal(anoPadrao(s), 2025);
  const [m] = await rpc<{ n: number }>(`select public.mirror_year_to_hex_cells(2025::smallint) n`);
  assert.equal(m.n, total);
  const [vazio] = await rpc<{ level: number; score: number; counts: Record<string, unknown>; period: string }>(`select level, score, counts, period from public.hex_cells where h3_index = $1`, [r9[0]]);
  assert.deepEqual([vazio.level, vazio.score, vazio.counts, vazio.period], [1, 0, { total: 0, peso: 0 }, '2025']);
  const [cheio] = await rpc<{ counts: Record<string, unknown> }>(`select counts from public.hex_cells where h3_index = $1`, [r9[1]]);
  assert.equal(cheio.counts.por_periodo, undefined, 'o espelho tira o detalhe por período');
});

test('hexagons_in_view: formato do app, ano padrão, outro ano, períodos e horas', async () => {
  const h = await rpc<Record<string, any>>(`select * from public.hexagons_in_view($1, $2, $3, $4, 9, 2000)`, CAIXA);
  assert.deepEqual(Object.keys(h[0]), ['h3_index', 'level', 'score', 'geometry', 'levels_by_period', 'levels_by_hour']);
  assert.equal(h[0].geometry.type, 'Polygon');
  const local = new Map(s.hex.filter((l) => l.year === 2025).map((l) => [l.h3_index, l]));
  for (const x of h) {
    assert.equal(x.level, local.get(x.h3_index)?.level ?? 1);
    assert.equal(x.levels_by_period, null);
    assert.equal(x.levels_by_hour, null);
  }
  const h26 = await rpc<Record<string, any>>(`select * from public.hexagons_in_view($1, $2, $3, $4, 9, 2000, 2026, true, true)`, CAIXA);
  const l26 = new Map(s.hex.filter((l) => l.year === 2026).map((l) => [l.h3_index, l]));
  for (const x of h26) {
    assert.deepEqual(x.levels_by_period, l26.get(x.h3_index)!.levels_by_period);
    assert.deepEqual(x.levels_by_hour, l26.get(x.h3_index)!.levels_by_hour);
  }
  const lim = await rpc(`select * from public.hexagons_in_view($1, $2, $3, $4, 9, 5)`, CAIXA);
  assert.equal(lim.length, 5);
});

test('locate_point: as 8 colunas de antes na mesma ordem, mais ano, períodos e horas', async () => {
  const [l] = await rpc<Record<string, any>>(`select * from public.locate_point($1, $2, 9)`, [CENTRO.lat, CENTRO.lng]);
  assert.deepEqual(Object.keys(l).slice(0, 8), ['district_id', 'district_name', 'subprefecture_id', 'subprefecture_name', 'h3_index', 'level', 'score', 'counts']);
  assert.equal(l.h3_index, r9[0]);
  assert.equal(l.level, 1, 'hexágono sem BO no ano = nível 1');
  assert.deepEqual(l.counts, { total: 0, peso: 0 });
  assert.equal(l.year, 2025);
  const [l24] = await rpc<Record<string, any>>(`select * from public.locate_point($1, $2, 9, 2024)`, [CENTRO.lat, CENTRO.lng]);
  assert.equal(l24.counts.total, 10);
  assert.equal(l24.total_by_hour.length, 24);
  const [fora] = await rpc<Record<string, any>>(`select * from public.locate_point(-23.0, -46.0, 9)`);
  assert.equal(fora.h3_index, null);
  assert.equal(fora.level, null);
});

test('address_report: agregado igual à conta independente, LGPD, eventos e sigilo', async () => {
  const [{ r }] = await rpc<{ r: any }>(`select public.address_report($1, $2, 500) r`, [CENTRO.lat, CENTRO.lng]);
  const areas = areasDaGrade(grade);
  const hs = r9.filter((h) => {
    const [a, b] = cellToLatLng(h);
    return distanciaM(a, b, CENTRO.lat, CENTRO.lng) <= 500;
  });
  const local = new Map(s.hex.filter((l) => l.year === 2025).map((l) => [l.h3_index, l]));
  let area = 0;
  let soma = 0;
  let total = 0;
  for (const h of hs) {
    area += areas[h];
    soma += (local.get(h)?.score ?? 0) * areas[h];
    total += Number(local.get(h)?.counts.total ?? 0);
  }
  assert.equal(r.year, 2025);
  assert.equal(r.hexagons, hs.length);
  assert.equal(r.total, total);
  assert.ok(Math.abs(r.score - soma / area) < 0.2, `${r.score} × ${soma / area}`);
  assert.equal(r.level, levelFor(soma / area, CORTES));
  assert.equal(r.district.name, 'Distrito');
  assert.equal(r.by_hour.reduce((a: number, b: number) => a + b, 0), total);
  assert.equal(r.by_period.reduce((a: number, p: any) => a + p.total, 0), total);
  assert.equal(r.levels_by_hour.length, 24);
  assert.equal(r.by_category.estupro, 2 * (hs.length - 1), 'o hexágono do centro não tem BO em 2025');
  const [{ r: pequeno }] = await rpc<{ r: any }>(`select public.address_report($1, $2, 100, 2024) r`, cellToLatLng(r9[0]));
  assert.equal(pequeno.hexagons, 1);
  assert.equal(pequeno.by_category.estupro, '<3', 'LGPD: crime sexual com menos de 3 registros');
  assert.equal(r.evolution.length, 3);
  assert.equal(r.same_period.months, 8);
  assert.equal(r.security_units.policia_militar.within_1km, 1);
  // avisos: só com >= 15% no ano consultado; texto de rua diferente
  assert.deepEqual(r.event_venues.map((e: any) => e.name).sort(), ['Arena perto', 'Rua perto']);
  assert.match(r.event_venues.find((e: any) => e.kind === 'rua').message, /grandes eventos de rua \(como Carnaval e Parada\)/);
  assert.match(r.event_venues.find((e: any) => e.kind === 'arena').message, /^40% dos registros deste local \(Arena perto\) aconteceram em 3 dias de evento em 2025$/);
  const [{ r: r24 }] = await rpc<{ r: any }>(`select public.address_report($1, $2, 500, 2024) r`, [CENTRO.lat, CENTRO.lng]);
  assert.equal(r24.event_venues.length, 0, '5% em 2024: sem aviso');
  assert.equal(r.hidden_location.message, 'A SSP não divulga a localização de parte dos registros (cerca de 8% no total, todos os estupros, cerca de 1/3 dos homicídios e 4 em cada 10 lesões). Esses registros não aparecem no mapa.');
  const [{ r: sem }] = await rpc<{ r: any }>(`select public.address_report($1, $2, 500, 1999) r`, [CENTRO.lat, CENTRO.lng]);
  assert.equal(sem.error, 'sem_dados');
});

test('permissões: cliente só lê; funções de gravação só para service_role', async () => {
  const tabelas = ['datasets', 'level_breaks', 'hex_stats', 'event_venues', 'hex_cells'];
  for (const papel of ['anon', 'authenticated']) {
    await db.exec(`set role ${papel}`);
    try {
      for (const t of tabelas) {
        await assert.rejects(db.query(`insert into public.${t} default values`), /permission denied/, `${papel} insert ${t}`);
        await assert.rejects(db.query(`delete from public.${t}`), /permission denied/, `${papel} delete ${t}`);
      }
      await assert.rejects(db.query(`select public.mirror_year_to_hex_cells(2025::smallint)`), /permission denied/);
      await assert.rejects(db.query(`select public.set_hex_cell_areas('{}'::jsonb)`), /permission denied/);
      const [{ n }] = (await db.query<{ n: number }>(`select count(*)::int n from public.hex_stats`)).rows;
      assert.ok(n > 0, 'leitura pública');
      await db.query(`select public.address_report($1, $2)`, [CENTRO.lat, CENTRO.lng]);
    } finally {
      await db.exec('reset role');
    }
  }
});
