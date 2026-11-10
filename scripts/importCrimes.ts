/**
 * Lê a planilha de BOs da SSP-SP por streaming, descarta localizações inválidas ou fora do município,
 * agrega por hexágono H3 (resoluções 7, 8 e 9) com os pesos de src/config/crimeWeights.ts e grava em hex_cells.
 *
 *   npm run import:crimes                     → relatório (não grava): categorias, textos sem regra, níveis
 *   npm run import:crimes -- --gravar         → grava (upsert) em public.hex_cells
 *   Opções: --arquivo=caminho.xlsx  --periodo=2025
 */
import fs from 'fs';
import path from 'path';
import ExcelJS from 'exceljs';
import booleanPointInPolygon from '@turf/boolean-point-in-polygon';
import { point } from '@turf/helpers';
import { cellToBoundary, polygonToCellsExperimental, POLYGON_TO_CELLS_FLAGS } from 'h3-js';
import type { MultiPolygon } from 'geojson';
import { CRIME_WEIGHTS, classifyCrime, normalizeText, type CrimeCategory } from './src/config/crimeWeights';
import { readGeoSampa } from './src/lib/city';
import { DiagnosticoSemLocalizacao } from './src/lib/semLocalizacao';
import { polygonToEwkt } from './src/lib/geometry';
import { arg, dataDir, outDir } from './src/lib/paths';
import {
  addOccurrence,
  density,
  levelBreaks,
  levelFor,
  newAggregation,
  REFERENCE_RESOLUTION,
  RESOLUTIONS,
} from './src/lib/scoring';
import { adminClient, upsertInBatches } from './src/lib/supabase';

const REQUIRED = ['LATITUDE', 'LONGITUDE', 'RUBRICA', 'NATUREZA_APURADA'] as const;

interface District {
  geometry: MultiPolygon;
  bbox: [number, number, number, number];
}

function bboxOf(geom: MultiPolygon): [number, number, number, number] {
  let [minX, minY, maxX, maxY] = [Infinity, Infinity, -Infinity, -Infinity];
  for (const poly of geom.coordinates)
    for (const [x, y] of poly[0]) {
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
  return [minX, minY, maxX, maxY];
}

/** Aceita número ou texto com vírgula decimal ("-23,55"). */
function toNumber(v: unknown): number {
  if (typeof v === 'number') return v;
  if (typeof v === 'string') return Number(v.trim().replace(',', '.'));
  if (v && typeof v === 'object' && 'result' in v) return toNumber((v as { result: unknown }).result);
  return NaN;
}

function cellText(v: unknown): string {
  if (v == null) return '';
  if (typeof v === 'object' && 'richText' in v) return (v as { richText: { text: string }[] }).richText.map((t) => t.text).join('');
  if (typeof v === 'object' && 'result' in v) return String((v as { result: unknown }).result ?? '');
  return String(v);
}

/** Mês "AAAA-MM" de DATA_OCORRENCIA_BO (data ou serial do Excel, "AAAA-MM-DD" ou "DD/MM/AAAA"); "?" se não der. */
function monthOf(v: unknown): string {
  if (v instanceof Date && !Number.isNaN(v.getTime())) return v.toISOString().slice(0, 7);
  // Sem estilos (leitura mais rápida), o exceljs entrega datas como número serial do Excel (dias desde 1899-12-30).
  if (typeof v === 'number' && v > 20000 && v < 80000) return new Date(Math.round((v - 25569) * 86400000)).toISOString().slice(0, 7);
  const t = cellText(v).trim();
  let m = t.match(/^(\d{4})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}`;
  m = t.match(/^\d{1,2}\/(\d{1,2})\/(\d{4})/);
  if (m) return `${m[2]}-${m[1].padStart(2, '0')}`;
  return '?';
}

function defaultSpreadsheet(): string {
  const dir = path.join(dataDir(), 'SSP-SP');
  const file = fs.existsSync(dir) ? fs.readdirSync(dir).find((f) => f.endsWith('.xlsx') && !f.startsWith('~$')) : undefined;
  if (!file) throw new Error(`Nenhuma planilha .xlsx em ${dir}. Use --arquivo=caminho.xlsx`);
  return path.join(dir, file);
}

async function main() {
  const gravar = arg('gravar') === 'true';
  const periodo = arg('periodo') ?? '2025';
  const arquivo = arg('arquivo') ?? defaultSpreadsheet();
  console.log(`Planilha: ${arquivo}\nPeríodo: ${periodo}`);

  // Município = união dos 96 distritos (WGS84).
  const distritosGeo = readGeoSampa<{ nm_distrito_municipal: string }>('distritos');
  const districts: District[] = distritosGeo.map((f) => ({ geometry: f.geometry, bbox: bboxOf(f.geometry) }));
  const semLoc = new DiagnosticoSemLocalizacao(new Set(distritosGeo.map((f) => normalizeText(f.properties.nm_distrito_municipal))));
  const city = districts.reduce(
    (b, d) => [Math.min(b[0], d.bbox[0]), Math.min(b[1], d.bbox[1]), Math.max(b[2], d.bbox[2]), Math.max(b[3], d.bbox[3])],
    [Infinity, Infinity, -Infinity, -Infinity],
  );
  const insideCity = (lat: number, lng: number) => {
    if (lng < city[0] || lng > city[2] || lat < city[1] || lat > city[3]) return false;
    const pt = point([lng, lat]);
    return districts.some(
      (d) => lng >= d.bbox[0] && lng <= d.bbox[2] && lat >= d.bbox[1] && lat <= d.bbox[3] && booleanPointInPolygon(pt, d.geometry),
    );
  };

  // Grade completa: todo hexágono que toca o município, mesmo sem ocorrência (fica nível 1).
  const grid = new Map<number, Set<string>>(RESOLUTIONS.map((r) => [r, new Set<string>()]));
  for (const d of districts)
    for (const poly of d.geometry.coordinates)
      for (const res of RESOLUTIONS)
        for (const h of polygonToCellsExperimental(poly, res, POLYGON_TO_CELLS_FLAGS.containmentOverlapping, true))
          grid.get(res)!.add(h);

  const agg = newAggregation();
  const stats = { linhas: 0, semLocalizacao: 0, foraDoMunicipio: 0, duplicadas: 0, validas: 0 };
  // Duplicados: o mesmo BO (número + ano + delegacia) com a mesma categoria conta uma vez só,
  // mesmo que apareça em mais de uma aba ou em mais de uma linha.
  const vistos = new Set<string>();
  const colunasDoBo = new Set<string>();
  const porCategoria: Partial<Record<CrimeCategory, number>> = {};
  const textosOutros = new Map<string, number>();

  const reader = new ExcelJS.stream.xlsx.WorkbookReader(arquivo, {
    sharedStrings: 'cache',
    worksheets: 'emit',
    hyperlinks: 'ignore',
    styles: 'ignore',
    entries: 'ignore',
  });

  // Linhas por aba e por mês da ocorrência: revela abas com meses repetidos (BOs contados em dobro).
  const porAba: { aba: number; linhas: number; colunas: string[]; porMes: Record<string, number>; datasNaoLidas: string[] }[] = [];
  let aba = 0;
  for await (const sheet of reader) {
    aba++;
    const resumoAba = { aba, linhas: 0, colunas: [] as string[], porMes: {} as Record<string, number>, datasNaoLidas: [] as string[] };
    let boCols: string[] = [];
    porAba.push(resumoAba);
    let cols: Record<string, number> | null = null;
    for await (const row of sheet) {
      const values = row.values as unknown[];
      if (!cols) {
        const header = Array.from(values, (v) => normalizeText(cellText(v))); // row.values é esparso (começa no índice 1)
        if (REQUIRED.every((c) => header.includes(c))) {
          cols = Object.fromEntries(header.map((h, i) => [h, i]));
          const delegacia = header.find((h) => h === 'NOME_DELEGACIA') ?? header.find((h) => h.includes('DELEGACIA') && !h.includes('CIRCUNSCRICAO'));
          boCols = header.includes('NUM_BO') ? ['NUM_BO', 'ANO_BO', delegacia].filter((c): c is string => !!c && header.includes(c)) : [];
          boCols.forEach((c) => colunasDoBo.add(c));
          resumoAba.colunas = header.filter(Boolean);
          semLoc.usarCabecalho(header);
          console.log(`Aba ${aba}: cabeçalho na linha ${row.number}; duplicados por ${boCols.length ? boCols.join(' + ') : '— (sem NUM_BO, não verifica)'}`);
        }
        continue;
      }
      stats.linhas++;
      resumoAba.linhas++;
      const mes = cols.DATA_OCORRENCIA_BO !== undefined ? monthOf(values[cols.DATA_OCORRENCIA_BO]) : '?';
      resumoAba.porMes[mes] = (resumoAba.porMes[mes] ?? 0) + 1;
      if (mes === '?' && resumoAba.datasNaoLidas.length < 10) {
        const bruto = JSON.stringify(values[cols.DATA_OCORRENCIA_BO] ?? null);
        if (!resumoAba.datasNaoLidas.includes(bruto)) resumoAba.datasNaoLidas.push(bruto);
      }
      const lat = toNumber(values[cols.LATITUDE]);
      const lng = toNumber(values[cols.LONGITUDE]);
      if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat === 0 || lng === 0) {
        stats.semLocalizacao++;
        const txt = (c: string | undefined) => (c && cols![c] !== undefined ? cellText(values[cols![c]]) : '');
        semLoc.registrar(classifyCrime(txt('RUBRICA'), txt('NATUREZA_APURADA')), txt(semLoc.cidade), txt('BAIRRO'), txt('DESCR_TIPOLOCAL'));
        continue;
      }
      if (!insideCity(lat, lng)) {
        stats.foraDoMunicipio++;
        continue;
      }
      const rubrica = cellText(values[cols.RUBRICA]);
      const natureza = cellText(values[cols.NATUREZA_APURADA]);
      const category = classifyCrime(rubrica, natureza);
      if (boCols.length) {
        const chave = `${boCols.map((c) => cellText(values[cols![c]]).trim()).join('|')}|${category}`;
        if (vistos.has(chave)) {
          stats.duplicadas++;
          continue;
        }
        vistos.add(chave);
      }
      porCategoria[category] = (porCategoria[category] ?? 0) + 1;
      if (category === 'outros') {
        const key = normalizeText(`${rubrica} | ${natureza}`);
        textosOutros.set(key, (textosOutros.get(key) ?? 0) + 1);
      }
      addOccurrence(agg, lat, lng, category);
      stats.validas++;
      if (stats.linhas % 100_000 === 0) process.stdout.write(`  ${stats.linhas} linhas lidas\r`);
    }
    if (!cols) console.log(`Aba ${aba}: sem as colunas ${REQUIRED.join(', ')} — ignorada`);
  }
  if (!stats.linhas) throw new Error('Nenhuma linha de dados encontrada.');

  // Mês que aparece com volume relevante (>5% do mês) em mais de uma aba = provável duplicação.
  const mesesRepetidos = [...new Set(porAba.flatMap((a) => Object.keys(a.porMes)))].filter((mes) => {
    const contagens = porAba.map((a) => a.porMes[mes] ?? 0);
    const total = contagens.reduce((x, y) => x + y, 0);
    return mes !== '?' && contagens.filter((c) => c > total * 0.05).length > 1;
  });

  // Nota = densidade ponderada (pesos/km²); níveis pelos quintis da resolução de referência.
  const refCells = agg.get(REFERENCE_RESOLUTION)!;
  const breaks = levelBreaks([...refCells].map(([h, s]) => density(h, s)));

  const rows: object[] = [];
  const niveis: Record<number, number[]> = {};
  for (const res of RESOLUTIONS) {
    const cells = agg.get(res)!;
    const all = new Set([...grid.get(res)!, ...cells.keys()]);
    niveis[res] = [0, 0, 0, 0, 0];
    for (const h of all) {
      const s = cells.get(h);
      const score = density(h, s);
      const level = levelFor(score, breaks);
      niveis[res][level - 1]++;
      rows.push({
        h3_index: h,
        resolution: res,
        geom: polygonToEwkt(cellToBoundary(h, true)),
        score: Number(score.toFixed(4)),
        level,
        counts: { total: s?.total ?? 0, peso: s?.weight ?? 0, ...(s?.byCategory ?? {}) },
        period: periodo,
        updated_at: new Date().toISOString(),
      });
    }
  }

  const report = {
    periodo,
    arquivo: path.basename(arquivo),
    ...stats,
    porAba,
    mesesRepetidosEntreAbas: mesesRepetidos,
    duplicadosVerificadosPor: [...colunasDoBo],
    semLocalizacao_diagnostico: semLoc.resumo(),
    porCategoria,
    pesos: CRIME_WEIGHTS,
    cortesDeNivel_pesoPorKm2: breaks.map((b) => Number(b.toFixed(2))),
    hexagonos: Object.fromEntries(RESOLUTIONS.map((r) => [r, { total: niveis[r].reduce((a, b) => a + b, 0), porNivel: niveis[r] }])),
    textosEmOutros_top50: [...textosOutros].sort((a, b) => b[1] - a[1]).slice(0, 50),
  };
  fs.mkdirSync(outDir, { recursive: true });
  const reportFile = path.join(outDir, `relatorio_crimes_${periodo}.json`);
  fs.writeFileSync(reportFile, JSON.stringify(report, null, 2));

  console.log(`\nLinhas: ${stats.linhas} | sem localização: ${stats.semLocalizacao} | fora do município: ${stats.foraDoMunicipio} | duplicadas: ${stats.duplicadas} | válidas: ${stats.validas}`);
  for (const a of porAba)
    console.log(
      `Aba ${a.aba}: ${a.linhas} linhas, meses ${Object.keys(a.porMes).sort().join(', ')}` +
        (a.datasNaoLidas.length ? ` | exemplos de data não lida: ${a.datasNaoLidas.join(' ')}` : ''),
    );
  if (mesesRepetidos.length)
    console.log(
      colunasDoBo.size
        ? `Meses presentes em mais de uma aba: ${mesesRepetidos.join(', ')} (normal: a data é a da ocorrência; duplicados já removidos pelo número do BO).`
        : `⚠ ATENÇÃO: os meses ${mesesRepetidos.join(', ')} aparecem em mais de uma aba e a planilha não tem NUM_BO — os BOs podem estar duplicados. Não grave antes de conferir.`,
    );
  console.log('Por categoria:', porCategoria);
  const diag = report.semLocalizacao_diagnostico;
  console.log(
    `Sem localização: ${diag.daCapital} da capital (coluna de cidade: ${diag.colunaDeCidade ?? 'não encontrada'}); ` +
      `estupro na capital: ${diag.daCapitalPorCategoria.estupro ?? 0}, bairro casa com distrito: ` +
      `${diag.bairroCasaComNomeDeDistrito.estupro?.sim ?? 0} de ${diag.daCapitalPorCategoria.estupro ?? 0}`,
  );
  console.log('Cortes de nível (peso/km²):', report.cortesDeNivel_pesoPorKm2);
  for (const r of RESOLUTIONS) console.log(`Resolução ${r}: ${report.hexagonos[r].total} hexágonos, por nível 1..5 = ${niveis[r].join(' / ')}`);
  console.log(`Relatório completo: ${reportFile}`);

  if (!gravar) {
    console.log('\nNada foi gravado. Revise o relatório e rode com --gravar para enviar ao Supabase.');
    return;
  }
  await upsertInBatches(adminClient(), 'hex_cells', rows, 'h3_index', 500);
  console.log('\nHexágonos gravados.');
}

main().catch((err) => {
  console.error(process.env.DEBUG && err instanceof Error ? err.stack : err instanceof Error ? err.message : err);
  process.exit(1);
});
