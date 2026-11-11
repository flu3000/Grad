/**
 * Confere o banco como o app enxerga: com a chave PUBLICÁVEL de apps/mobile/.env (não imprime a chave nem a URL).
 *
 *   npm run data:conferir-publico
 *
 *   1. hexagons_in_view, locate_point e security_units_in_view: mesmas colunas (e na mesma ordem) que o app usa;
 *   2. hexagons_in_view (sem ano) = níveis do backup mais recente de hex_cells, se ainda não houver gravação, ou = o
 *      espelho atual de hex_cells, depois dela;
 *   3. escrita negada: insert/update/delete nas tabelas e as funções de gravação. As linhas tentadas violam de
 *      propósito uma restrição: mesmo que a permissão existisse, nada seria gravado; o código do erro mostra se a
 *      recusa veio da permissão (42501) ou só da restrição.
 * Sai com código 2 se algo não bater.
 */
import fs from 'fs';
import path from 'path';
import { createClient } from '@supabase/supabase-js';
import { lerBackup, pastaBackup } from './backup';

const ENV_APP = path.join(__dirname, '../apps/mobile/.env');

const resultados: { ok: boolean; nome: string; detalhe: string }[] = [];
const conferir = (ok: boolean, nome: string, detalhe = '') => {
  resultados.push({ ok, nome, detalhe });
  console.log(`${ok ? '✓' : '✗'} ${nome}${detalhe ? ` — ${detalhe}` : ''}`);
};
const iguais = (a: string[], b: string[]) => a.length === b.length && a.every((x, i) => x === b[i]);

async function main() {
  process.loadEnvFile(ENV_APP);
  const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
  const chave = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !chave) throw new Error('Faltam EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY em apps/mobile/.env');
  if (!chave.startsWith('sb_publishable_')) throw new Error('A chave do app não parece ser a publicável: pare e confira apps/mobile/.env.');
  const db = createClient(url, chave, { auth: { persistSession: false, autoRefreshToken: false } });

  // 1. formato (as mesmas chamadas de apps/mobile/src/lib/mapa.ts)
  const caixa = { min_lng: -46.68, min_lat: -23.58, max_lng: -46.63, max_lat: -23.54 };
  const { data: hex, error: eHex } = await db.rpc('hexagons_in_view', { ...caixa, res: 9, max_cells: 2000 });
  const colsHex = hex?.[0] ? Object.keys(hex[0]) : [];
  conferir(
    !eHex && iguais(colsHex.slice(0, 4), ['h3_index', 'level', 'score', 'geometry']) && hex!.every((h: any) => h.geometry?.type === 'Polygon' && h.levels_by_period === null && h.levels_by_hour === null),
    'hexagons_in_view: as 4 colunas do app na mesma ordem (+2 novas, nulas sem with_*)',
    eHex?.message ?? `${hex!.length} hexágonos; colunas ${colsHex.join(', ')}`,
  );
  const { data: lp, error: eLp } = await db.rpc('locate_point', { lat: -23.5614, lng: -46.6559, res: 8 });
  const colsLp = lp?.[0] ? Object.keys(lp[0]) : [];
  conferir(
    !eLp && iguais(colsLp.slice(0, 8), ['district_id', 'district_name', 'subprefecture_id', 'subprefecture_name', 'h3_index', 'level', 'score', 'counts']) && !!lp[0].district_name && typeof lp[0].counts?.total === 'number',
    'locate_point: as 8 colunas do app na mesma ordem (+ano, períodos e horas)',
    eLp?.message ?? `${lp[0].district_name}, nível ${lp[0].level}, ${lp[0].counts.total} BOs; colunas ${colsLp.join(', ')}`,
  );
  const { data: su, error: eSu } = await db.rpc('security_units_in_view', { ...caixa, max_units: 400 });
  conferir(
    !eSu && iguais(Object.keys(su?.[0] ?? {}), ['id', 'kind', 'name', 'address', 'neighborhood', 'postal_code', 'phone', 'district_name', 'lat', 'lng']),
    'security_units_in_view: formato igual ao de antes',
    eSu?.message ?? `${su!.length} unidades`,
  );

  // 2. níveis: antes da gravação = backup; depois = espelho atual de hex_cells
  const { count: anos } = await db.from('datasets').select('year', { count: 'exact', head: true });
  const ref = new Map<string, number>();
  if (!anos) {
    const arquivo = fs.readdirSync(pastaBackup()).filter((f) => /^hex_cells_.*\.json\.gz$/.test(f)).sort().at(-1);
    for (const c of lerBackup(path.join(pastaBackup(), arquivo!))) ref.set(c.h3_index, c.level);
  } else {
    const { data } = await db.from('hex_cells').select('h3_index, level').in('h3_index', (hex ?? []).map((h: any) => h.h3_index));
    for (const c of data ?? []) ref.set(c.h3_index, c.level);
  }
  const dif = (hex ?? []).filter((h: any) => ref.get(h.h3_index) !== h.level).length;
  conferir(dif === 0, `hexagons_in_view = ${anos ? 'espelho de hex_cells' : 'backup (antes da gravação)'}`, `${dif} de ${(hex ?? []).length} diferentes`);

  // 3. escrita negada
  const tentativas: [string, PromiseLike<{ error: { code?: string; message: string } | null }>][] = [
    ['insert datasets', db.from('datasets').insert({ year: 1900, first_month: 99, last_month: 99, last_complete_month: 99, months_covered: 99, complete: false, rows_valid: -1, rows_no_location: -1 })],
    ['insert level_breaks', db.from('level_breaks').insert({ resolution: 99, breaks: [1], reference: 'teste' })],
    ['insert hex_stats', db.from('hex_stats').insert({ h3_index: 'nao_existe', year: 1900, resolution: 99, score: -1, level: 99 })],
    ['insert event_venues', db.from('event_venues').insert({ name: 'teste', year: 1900, lat: 0, lng: 0, radius_m: -1, kind: 'x', bos: -1, median_per_day: 0, peak_threshold: 0, peak_days: -1, pct_in_peak_days: 999, geom: 'SRID=4326;POINT(0 0)' })],
    ['update hex_cells', db.from('hex_cells').update({ level: 99 }).eq('h3_index', 'nao_existe')],
    ['delete hex_stats', db.from('hex_stats').delete().eq('h3_index', 'nao_existe')],
    ['delete datasets', db.from('datasets').delete().eq('year', 1900)],
    ['rpc mirror_year_to_hex_cells', db.rpc('mirror_year_to_hex_cells', { p_year: 1900 })],
    ['rpc set_hex_cell_areas', db.rpc('set_hex_cell_areas', { p_areas: {} })],
  ];
  for (const [nome, p] of tentativas) {
    const { error } = await p;
    conferir(error?.code === '42501', `escrita negada: ${nome}`, error ? `${error.code} ${error.message}` : 'SEM ERRO (a escrita passou!)');
  }

  const falhas = resultados.filter((x) => !x.ok);
  console.log(`\n${resultados.length - falhas.length}/${resultados.length} conferências ok`);
  if (falhas.length) process.exit(2);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
