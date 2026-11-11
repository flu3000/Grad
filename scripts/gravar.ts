/**
 * Grava a saída final (scripts/out/consolidado/final/) no Supabase: datasets, level_breaks, hex_stats, event_venues,
 * hex_cells.area_km2 e o espelho do ano padrão em hex_cells.level/score/counts (o app atual lê hex_cells).
 *
 *   npm run data:gravar               → SIMULA: confere a saída, mostra o que seria gravado e lê o banco (só leitura)
 *   npm run data:gravar -- --gravar   → grava (upsert em lotes). Só com autorização do dono.
 *
 * Nunca apaga nada: linhas do banco que não existem mais na saída local só são listadas.
 * Exige a migration 20261111140549_anos_periodos_horarios_e_enderecos aplicada e um `npm run data:verificar`
 * sem falhas, posterior à consolidação. Depois de gravar: `npm run data:conferir-banco`.
 */
import fs from 'fs';
import path from 'path';
import type { SupabaseClient } from '@supabase/supabase-js';
import { arg, outDir } from './src/lib/paths';
import { adminClient, upsertInBatches } from './src/lib/supabase';
import { gradeDoMunicipio } from './src/pipeline/consolidacao';
import {
  anoPadrao,
  areasDaGrade,
  contagemPorAnoResolucao,
  lerSaidaFinal,
  linhasDatasets,
  linhasEventVenues,
  linhasHexStats,
  linhasLevelBreaks,
} from './src/pipeline/gravacao';

const LOTE_HEX = 500;
const LOTE_AREAS = 3000;

const mb = (x: unknown) => (Buffer.byteLength(JSON.stringify(x)) / 1e6).toFixed(1);

/** Lê uma coluna inteira de uma tabela, em páginas (o PostgREST devolve no máximo 1000 linhas por vez). */
async function lerTudo<T>(db: SupabaseClient, tabela: string, colunas: string): Promise<T[]> {
  const out: T[] = [];
  for (let de = 0; ; de += 1000) {
    const { data, error } = await db.from(tabela).select(colunas).range(de, de + 999);
    if (error) throw new Error(`${tabela}: ${error.message}`);
    out.push(...((data ?? []) as T[]));
    if (!data || data.length < 1000) return out;
  }
}

function conferirVerificacao(modificadoEm: number): string | null {
  const f = path.join(outDir, 'verificacao.md');
  if (!fs.existsSync(f)) return 'falta scripts/out/verificacao.md: rode npm run data:verificar';
  if (fs.statSync(f).mtimeMs < modificadoEm) return 'a verificação é anterior à última consolidação: rode npm run data:verificar de novo';
  if (!/todas as \d+ checagens automáticas passaram/.test(fs.readFileSync(f, 'utf-8'))) return 'a última verificação tem checagens falhando';
  return null;
}

async function main() {
  const gravar = arg('gravar') === 'true';
  const s = lerSaidaFinal();
  const problema = conferirVerificacao(s.modificadoEm);
  const ano = anoPadrao(s);
  const datasets = linhasDatasets(s);
  const breaks = linhasLevelBreaks(s);
  const hex = linhasHexStats(s);
  const eventos = linhasEventVenues(s);
  const grade = gradeDoMunicipio();
  const areas = areasDaGrade(grade);
  const porAnoRes = contagemPorAnoResolucao(hex);

  console.log(`Saída final: ${s.datasets.length} anos, ano padrão ${ano} (o ano completo mais recente).`);
  console.log(problema ? `\n✗ ${problema}` : '✓ verificação posterior à consolidação, sem falhas');
  console.log('\nO que seria gravado (upsert pela chave primária; nada é apagado):');
  console.log(`  datasets      ${datasets.length} linhas (${datasets.map((d) => `${d.year}${d.complete ? '' : ` parcial até ${d.last_complete_month}`}`).join(', ')})`);
  console.log(`  level_breaks  ${breaks.length} linhas (res ${breaks.map((b) => b.resolution).join('/')})`);
  console.log(`  hex_stats     ${hex.length} linhas, ${Math.ceil(hex.length / LOTE_HEX)} lotes de ${LOTE_HEX}, ~${mb(hex)} MB de JSON enviado`);
  for (const d of datasets) console.log(`                ${d.year}: ${[7, 8, 9].map((r) => `res ${r} ${porAnoRes[`${d.year}|${r}`] ?? 0}`).join(', ')}`);
  console.log(`  event_venues  ${eventos.length} linhas (${new Set(eventos.map((e) => e.name)).size} locais × ${datasets.length} anos)`);
  console.log(`  hex_cells     area_km2 de ${Object.keys(areas).length} hexágonos (set_hex_cell_areas) e espelho de ${ano} (mirror_year_to_hex_cells)`);

  // leitura do banco (só se houver credenciais): migration aplicada? grade igual? o que seria inserido × atualizado?
  let db: SupabaseClient | null = null;
  try {
    db = adminClient();
  } catch {
    console.log('\nSem SUPABASE_URL/SUPABASE_SECRET_KEY em scripts/.env: pulei a leitura do banco.');
  }
  if (db) {
    console.log('\nBanco (só leitura):');
    const { error: semTabela } = await db.from('hex_stats').select('h3_index').limit(1);
    if (semTabela) {
      console.log(`  ✗ hex_stats não existe (${semTabela.message}): a migration ainda não foi aplicada.`);
      if (gravar) throw new Error('Aplique a migration antes de gravar.');
    } else {
      const celulas = await lerTudo<{ h3_index: string }>(db, 'hex_cells', 'h3_index');
      const noBanco = new Set(celulas.map((c) => c.h3_index));
      const foraDoBanco = hex.filter((l) => !noBanco.has(l.h3_index)).length;
      const gradeLocal = Object.keys(areas);
      console.log(`  hex_cells: ${noBanco.size} no banco, ${gradeLocal.length} na grade local, ${gradeLocal.filter((h) => !noBanco.has(h)).length} da grade faltando no banco`);
      console.log(`  ${foraDoBanco ? '✗' : '✓'} linhas de hex_stats sem hexágono em hex_cells: ${foraDoBanco}`);
      if (foraDoBanco && gravar) throw new Error('Há hexágonos fora de hex_cells (a chave estrangeira recusaria).');
      const atuais = await lerTudo<{ h3_index: string; year: number }>(db, 'hex_stats', 'h3_index,year');
      const chave = (l: { h3_index: string; year: number }) => `${l.h3_index}|${l.year}`;
      const locais = new Set(hex.map(chave));
      const jaExistem = atuais.filter((l) => locais.has(chave(l))).length;
      const orfas = atuais.filter((l) => !locais.has(chave(l)));
      console.log(`  hex_stats: ${atuais.length} linhas hoje → ${hex.length - jaExistem} inseridas, ${jaExistem} atualizadas`);
      if (orfas.length)
        console.log(`  ! ${orfas.length} linhas do banco não existem mais na saída local (hexágono × ano que ficou sem BO). NÃO serão apagadas; peça ao dono antes de remover.`);
      const { data: ds } = await db.from('datasets').select('year,imported_at');
      console.log(`  datasets hoje: ${(ds ?? []).map((d) => `${d.year} (${String(d.imported_at).slice(0, 10)})`).join(', ') || 'vazia'}`);
    }
  }

  if (!gravar) {
    console.log('\nSimulação: nada foi gravado. Para gravar (com autorização): npm run data:gravar -- --gravar');
    return;
  }
  if (problema) throw new Error(`Não gravo: ${problema}.`);
  if (!db) throw new Error('Sem credenciais do Supabase.');

  const t0 = Date.now();
  console.log('\nGravando...');
  await upsertInBatches(db, 'datasets', datasets, 'year');
  console.log(`  datasets: ${datasets.length}            `);
  await upsertInBatches(db, 'level_breaks', breaks, 'resolution');
  console.log(`  level_breaks: ${breaks.length}            `);
  await upsertInBatches(db, 'hex_stats', hex, 'h3_index,year', LOTE_HEX);
  console.log(`  hex_stats: ${hex.length}            `);
  await upsertInBatches(db, 'event_venues', eventos, 'name,year');
  console.log(`  event_venues: ${eventos.length}            `);
  const chaves = Object.keys(areas);
  let nAreas = 0;
  for (let i = 0; i < chaves.length; i += LOTE_AREAS) {
    const lote = Object.fromEntries(chaves.slice(i, i + LOTE_AREAS).map((h) => [h, areas[h]]));
    const { data, error } = await db.rpc('set_hex_cell_areas', { p_areas: lote });
    if (error) throw new Error(`set_hex_cell_areas: ${error.message}`);
    nAreas += data as number;
  }
  console.log(`  hex_cells.area_km2: ${nAreas}`);
  const { data: nEspelho, error: eEspelho } = await db.rpc('mirror_year_to_hex_cells', { p_year: ano });
  if (eEspelho) throw new Error(`mirror_year_to_hex_cells: ${eEspelho.message}`);
  console.log(`  hex_cells espelhando ${ano}: ${nEspelho}`);
  console.log(`\nGravado em ${Math.round((Date.now() - t0) / 1000)} s. Confira com: npm run data:conferir-banco`);
}

main().catch((err) => {
  console.error(process.env.DEBUG && err instanceof Error ? err.stack : err instanceof Error ? err.message : err);
  process.exit(1);
});
