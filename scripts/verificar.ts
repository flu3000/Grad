/**
 * Verificação completa antes de gravar (Etapa 4). Falha (código 2) se alguma checagem automática não passar e gera
 * scripts/out/verificacao.md, mais os arquivos de conferência (locais, fora do Git):
 *   scripts/out/verificacao_amostras.csv  — 50 BOs aleatórios por ano (endereço, origem da coordenada, hexágono)
 *   scripts/out/verificacao_mapa.html     — antes (Etapa 1, só coordenadas da SSP) × depois (final), 6 lugares
 *
 *   npm run data:verificar      (precisa do data:geocodificar; usa as parciais em cache)
 *
 * Partes:
 *   1. invariantes da consolidação + conferência independente das linhas gravadas;
 *   2. números oficiais da SSP (se houver arquivos em data/SSP-SP/oficial/);
 *   3. comparação com o banco em 2025 (lê scripts/out/comparacao_banco_2025.json, do data:comparar-banco);
 *   4. amostras e mapa;
 *   5. volume estimado no banco.
 * Não grava nada no Supabase.
 */
import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import { cellToBoundary, gridDisk, latLngToCell } from 'h3-js';
import { periodoDaHora } from './src/lib/horario';
import { lerLinhaCsv, type LinhaLimpa } from './src/lib/limpeza';
import { carregarMunicipio } from './src/lib/municipio';
import { outDir } from './src/lib/paths';
import { levelFor, RESOLUTIONS, TOTAL_NIVEIS } from './src/lib/scoring';
import { consolidar, gradeDoMunicipio, type Invariante, type LinhaHex } from './src/pipeline/consolidacao';
import { lerManifesto, partesDoManifesto, pastaLimpo } from './src/pipeline/extracao';
import { decidir, situacaoDoPonto } from './src/pipeline/geocodificacao';
import { CATEGORIAS_OFICIAIS, contarNossos, lerOficiais, pastaOficial } from './src/pipeline/oficial';
import { classificar, geocodificadorDoCache, processarTudo, REGRAS_PADRAO } from './src/pipeline/processamento';
import { opcoesDoProcessamento } from './processar';

const POR_ANO = 50;
const LUGARES = [
  { nome: 'Sé', lat: -23.5503, lng: -46.6339 },
  { nome: 'Paulista', lat: -23.5614, lng: -46.6559 },
  { nome: 'Brás', lat: -23.544, lng: -46.616 },
  { nome: 'Itaquera', lat: -23.54, lng: -46.456 },
  { nome: 'Alto de Pinheiros', lat: -23.549, lng: -46.715 },
  { nome: 'Interlagos', lat: -23.7035, lng: -46.6985 },
];

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

const soma = (xs: readonly number[]) => xs.reduce((a, b) => a + b, 0);
const fmt = (n: number) => n.toLocaleString('pt-BR');
const pct = (a: number, b: number, casas = 1) => (b ? `${((100 * a) / b).toFixed(casas).replace('.', ',')}%` : '-');

// ------------------------------------------------------------------------------- 1. conferência das linhas

function conferirLinhas(linhas: LinhaHex[], cortes: Record<number, number[]>, grade: Map<number, Set<string>>): Invariante[] {
  let tamanhos = 0;
  let periodo = 0;
  let hora = 0;
  let mes = 0;
  let foraNivel = 0;
  let foraGrade = 0;
  let nivelDiferente = 0;
  let nivelNaBorda = 0;
  for (const l of linhas) {
    const c = l.counts as Record<string, number>;
    if (l.weight_by_period.length !== 4 || l.total_by_period.length !== 4 || l.levels_by_period.length !== 4) tamanhos++;
    if (l.weight_by_hour.length !== 24 || l.total_by_hour.length !== 24 || l.levels_by_hour.length !== 24) tamanhos++;
    if (l.weight_by_month.length !== 12 || l.total_by_month.length !== 12) tamanhos++;
    if (soma(l.total_by_period) + c.sem_periodo !== c.total) periodo++;
    if (soma(l.total_by_hour) + c.sem_hora !== c.total) hora++;
    if (soma(l.total_by_month) !== c.total) mes++;
    for (const n of [l.level, ...l.levels_by_period, ...l.levels_by_hour]) if (n < 1 || n > TOTAL_NIVEIS || !Number.isInteger(n)) foraNivel++;
    if (c.total > 0 && !grade.get(l.resolution)!.has(l.h3_index)) foraGrade++;
    const n = levelFor(l.score, cortes[l.resolution]);
    if (n !== l.level) {
      // o score gravado tem 4 casas: só aceita a diferença se ele estiver colado num corte
      if (cortes[l.resolution].some((x) => Math.abs(x - l.score) < 1e-3)) nivelNaBorda++;
      else nivelDiferente++;
    }
  }
  const quebras = RESOLUTIONS.every((r) => cortes[r].length === 9 && cortes[r].every((x, i) => i === 0 || x > cortes[r][i - 1]));
  return [
    { nome: 'linhas gravadas: arrays com 4 períodos, 24 horas e 12 meses', ok: !tamanhos, detalhe: `${tamanhos} arrays com tamanho errado` },
    { nome: 'linhas gravadas: períodos + sem período = total', ok: !periodo, detalhe: `${periodo} linhas com erro` },
    { nome: 'linhas gravadas: horas + sem hora = total', ok: !hora, detalhe: `${hora} linhas com erro` },
    { nome: 'linhas gravadas: meses = total', ok: !mes, detalhe: `${mes} linhas com erro` },
    { nome: 'linhas gravadas: níveis (dia, períodos e horas) inteiros entre 1 e 10', ok: !foraNivel, detalhe: `${foraNivel} níveis fora` },
    { nome: 'linhas gravadas: nenhum hexágono fora da grade do município', ok: !foraGrade, detalhe: `${foraGrade} fora` },
    { nome: 'linhas gravadas: nível = corte aplicado ao score', ok: !nivelDiferente, detalhe: `${nivelDiferente} diferentes${nivelNaBorda ? `, ${nivelNaBorda} com o score colado num corte (arredondamento)` : ''}` },
    { nome: 'level_breaks: 9 cortes crescentes por resolução', ok: quebras, detalhe: RESOLUTIONS.map((r) => `res ${r}: ${cortes[r].length}`).join(', ') },
  ];
}

// --------------------------------------------------------------------------------- 4. amostras de BOs

interface Amostra {
  ano: number;
  data: string;
  hora: string;
  periodo: string;
  categoria: string;
  origem: string;
  logradouro: string;
  numero: string;
  bairro: string;
  lat: number;
  lng: number;
  hex8: string;
  hex9: string;
}

function amostrar(excluir: Record<string, number[]>): Record<number, Amostra[]> {
  const municipio = carregarMunicipio();
  const geocodificar = geocodificadorDoCache(REGRAS_PADRAO);
  const rnd = aleatorio(20261111);
  const res: Record<number, { itens: Amostra[]; vistos: number }> = {};
  const anos = new Set(REGRAS_PADRAO.anos);
  for (const p of partesDoManifesto(lerManifesto())) {
    const fora = new Set(excluir[p.arquivo] ?? []);
    const texto = zlib.gunzipSync(fs.readFileSync(path.join(pastaLimpo(), p.arquivo))).toString('utf-8');
    for (const bruto of texto.split('\n').slice(1)) {
      if (!bruto) continue;
      const l: LinhaLimpa = lerLinhaCsv(bruto);
      if (fora.has(l.linha) || !l.data_ocorrencia) continue;
      const ano = Number(l.data_ocorrencia.slice(0, 4));
      if (!anos.has(ano)) continue;
      const categoria = classificar(l.rubrica, l.natureza, REGRAS_PADRAO);
      const s = situacaoDoPonto(l, REGRAS_PADRAO.pontosPadrao, municipio.distritoDe, REGRAS_PADRAO.geocodificacao!.casasSuspeitas);
      const dec = decidir(l, categoria, s, REGRAS_PADRAO.geocodificacao, geocodificar, municipio.distritoDe);
      if (dec.origem === 'sem') continue;
      const r = (res[ano] ??= { itens: [], vistos: 0 });
      r.vistos++;
      const j = r.itens.length < POR_ANO ? r.itens.length : Math.floor(rnd() * r.vistos);
      if (j >= POR_ANO) continue;
      r.itens[j] = {
        ano,
        data: l.data_ocorrencia,
        hora: l.hora ?? '',
        periodo: l.hora ? periodoDaHora(Number(l.hora.slice(0, 2))) : (l.periodo ?? ''),
        categoria,
        origem: dec.origem === 'ssp' ? 'ssp' : `${dec.origem === 'preenchido' ? 'endereco' : 'trocado'}:${dec.geo.nivel}`,
        logradouro: l.logradouro ?? '',
        numero: l.numero === null ? '' : String(l.numero),
        bairro: l.bairro ?? '',
        lat: Number(dec.lat.toFixed(6)),
        lng: Number(dec.lng.toFixed(6)),
        hex8: latLngToCell(dec.lat, dec.lng, 8),
        hex9: latLngToCell(dec.lat, dec.lng, 9),
      };
    }
  }
  return Object.fromEntries(Object.entries(res).map(([a, r]) => [a, r.itens]));
}

function escreverAmostras(porAno: Record<number, Amostra[]>) {
  const cols = ['ano', 'data', 'hora', 'periodo', 'categoria', 'origem', 'logradouro', 'numero', 'bairro', 'lat', 'lng', 'hex8', 'hex9'] as const;
  const esc = (v: unknown) => {
    const s = String(v ?? '');
    return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const linhas = Object.values(porAno)
    .flat()
    .map((a) => [...cols.map((c) => a[c]), `https://www.google.com/maps?q=${a.lat},${a.lng}`].map(esc).join(','));
  fs.writeFileSync(path.join(outDir, 'verificacao_amostras.csv'), '﻿' + [[...cols, 'google_maps'].join(','), ...linhas].join('\n'));
}

// ------------------------------------------------------------------------------------- 4. mapa antes × depois

type NiveisHex = { d: number; p: number[]; h: number[]; t: number };

function lerHex(arquivo: string, filtro: Set<string>): Map<string, NiveisHex> {
  const m = new Map<string, NiveisHex>();
  for (const l of zlib.gunzipSync(fs.readFileSync(arquivo)).toString('utf-8').split('\n')) {
    if (!l) continue;
    const x = JSON.parse(l) as LinhaHex;
    if (x.resolution !== 9 || !filtro.has(x.h3_index)) continue;
    m.set(`${x.h3_index}|${x.year}`, { d: x.level, p: x.levels_by_period, h: x.levels_by_hour, t: Number((x.counts as Record<string, number>).total ?? 0) });
  }
  return m;
}

function escreverMapa(antesArquivo: string, depoisArquivo: string, anos: number[]) {
  const lugares = LUGARES.map((lg) => ({ ...lg, hex: gridDisk(latLngToCell(lg.lat, lg.lng, 9), 6) }));
  const todos = new Set(lugares.flatMap((l) => l.hex));
  const antes = lerHex(antesArquivo, todos);
  const depois = lerHex(depoisArquivo, todos);
  const vazio: NiveisHex = { d: 1, p: [1, 1, 1, 1], h: Array(24).fill(1), t: 0 };
  const dados = lugares.map((lg) => ({
    nome: lg.nome,
    centro: [lg.lat, lg.lng],
    hex: lg.hex.map((h) => ({
      h,
      b: cellToBoundary(h).map(([a, b]) => [Number(a.toFixed(6)), Number(b.toFixed(6))]),
      a: Object.fromEntries(anos.map((y) => [y, antes.get(`${h}|${y}`) ?? vazio])),
      d: Object.fromEntries(anos.map((y) => [y, depois.get(`${h}|${y}`) ?? vazio])),
    })),
  }));
  const html = `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Mapa antes e depois</title>
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css">
<style>
  html, body { margin: 0; height: 100%; font: 14px system-ui, sans-serif; }
  #barra { padding: 8px 12px; display: flex; gap: 12px; align-items: center; flex-wrap: wrap; border-bottom: 1px solid #ccc; }
  #mapas { position: absolute; top: 84px; bottom: 0; left: 0; right: 0; display: flex; }
  .m { flex: 1; position: relative; }
  .m > div { position: absolute; inset: 0; }
  .rot { position: absolute; z-index: 1000; top: 8px; left: 50px; background: #fff; padding: 2px 8px; border-radius: 4px; font-weight: 600; }
  #leg span { display: inline-block; width: 18px; height: 12px; margin-right: 2px; }
</style></head><body>
<div id="barra">
  <label>Lugar <select id="lugar"></select></label>
  <label>Ano <select id="ano"></select></label>
  <label>Filtro <select id="modo"><option value="d">Dia inteiro</option><option value="p0">Madrugada</option><option value="p1">Manhã</option><option value="p2">Tarde</option><option value="p3">Noite</option><option value="h">Por hora</option></select></label>
  <label id="lh" style="display:none">Hora <input id="hora" type="range" min="0" max="23" value="18"> <span id="hv">18h</span></label>
  <span id="leg"></span>
  <small>Antes = Etapa 1 (só coordenadas da SSP). Depois = final (geocodificação, pontos padrão, anualização sazonal). Hexágonos res 9; a hora usa a janela de 3 h centrada.</small>
</div>
<div id="mapas"><div class="m"><div id="ma"></div><span class="rot">Antes</span></div><div class="m"><div id="md"></div><span class="rot">Depois</span></div></div>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<script>
const DADOS = ${JSON.stringify(dados)};
const ANOS = ${JSON.stringify(anos)};
const CORES = ['#d9d9d9','#ffffcc','#ffeda0','#fed976','#feb24c','#fd8d3c','#fc4e2a','#e31a1c','#bd0026','#800026'];
const tiles = () => L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap' });
const ma = L.map('ma').setView([-23.55, -46.63], 14), md = L.map('md').setView([-23.55, -46.63], 14);
tiles().addTo(ma); tiles().addTo(md);
let sync = false;
const espelho = (a, b) => a.on('move', () => { if (sync) return; sync = true; b.setView(a.getCenter(), a.getZoom(), { animate: false }); sync = false; });
espelho(ma, md); espelho(md, ma);
const ca = L.layerGroup().addTo(ma), cd = L.layerGroup().addTo(md);
const $ = (id) => document.getElementById(id);
DADOS.forEach((l, i) => { const o = document.createElement('option'); o.value = i; o.textContent = l.nome; $('lugar').appendChild(o); });
ANOS.forEach((a) => { const o = document.createElement('option'); o.value = a; o.textContent = a; $('ano').appendChild(o); });
$('ano').value = ANOS.includes(2025) ? 2025 : ANOS[0];
$('leg').innerHTML = CORES.map((c, i) => '<span title="nível ' + (i + 1) + '" style="background:' + c + '"></span>').join('') + ' níveis 1–10';
function nivel(x, modo, hora) { return modo === 'd' ? x.d : modo === 'h' ? x.h[hora] : x.p[Number(modo.slice(1))]; }
function desenhar(centralizar) {
  const l = DADOS[$('lugar').value], ano = $('ano').value, modo = $('modo').value, hora = Number($('hora').value);
  $('lh').style.display = modo === 'h' ? '' : 'none'; $('hv').textContent = hora + 'h';
  ca.clearLayers(); cd.clearLayers();
  for (const x of l.hex) for (const [g, k] of [[ca, 'a'], [cd, 'd']]) {
    const v = x[k][ano], n = nivel(v, modo, hora);
    L.polygon(x.b, { color: '#555', weight: 0.5, fillColor: CORES[n - 1], fillOpacity: 0.65 }).bindTooltip('nível ' + n + ' · ' + v.t + ' BOs no ano').addTo(g);
  }
  if (centralizar) ma.setView(l.centro, 14);
}
['ano', 'modo', 'hora'].forEach((id) => $(id).addEventListener('input', () => desenhar(false)));
$('lugar').addEventListener('input', () => desenhar(true));
desenhar(true);
</script></body></html>`;
  fs.writeFileSync(path.join(outDir, 'verificacao_mapa.html'), html);
}

// ----------------------------------------------------------------------------------------- 5. volume

/** Estimativa do tamanho no Postgres (tupla + arrays + jsonb + índices), em bytes. */
function estimarHexStats(linhas: LinhaHex[]) {
  let tuplas = 0;
  let jsonb = 0;
  for (const l of linhas) {
    const j = Buffer.byteLength(JSON.stringify(l.counts)) * 1.15 + 8; // jsonb ≈ texto + cabeçalhos
    jsonb += j > 2000 ? j * 0.45 : j; // acima de ~2 kB o TOAST comprime
    const arrays = [4 * 4, 4 * 4, 2 * 4, 4 * 24, 4 * 24, 2 * 24, 4 * 12, 4 * 12].reduce((a, b) => a + 24 + b, 0);
    tuplas += 28 + 16 + 12 + arrays;
  }
  const dados = (tuplas + jsonb) * 1.1; // páginas não ficam 100% cheias
  const indices = linhas.length * (45 + 22);
  return { linhas: linhas.length, dadosMB: dados / 1e6, indicesMB: indices / 1e6, totalMB: (dados + indices) / 1e6, jsonbMedioB: jsonb / Math.max(1, linhas.length) };
}

// ------------------------------------------------------------------------------------------------ main

async function main() {
  const t0 = Date.now();
  const proc = await processarTudo(REGRAS_PADRAO, opcoesDoProcessamento());
  const c = await consolidar(proc, REGRAS_PADRAO, { nome: 'final', escala: 'fixa', conferirSequencial: 3 });
  const r = c.relatorio as Record<string, any>;
  const anos = c.datasets.map((d) => d.year);
  const grade = gradeDoMunicipio();
  const checks: Invariante[] = [...c.invariantes, ...conferirLinhas(c.linhas, c.cortes, grade)];
  for (const ano of anos) {
    const f = r.fatores[ano];
    checks.push({ nome: `${ano}: fatorPeriodo e fatorHora entre 1 e 2`, ok: f.periodo >= 1 && f.periodo < 2 && f.hora >= 1 && f.hora < 2, detalhe: `fatorPeriodo ${f.periodo.toFixed(4)}, fatorHora ${f.hora.toFixed(4)}` });
  }
  for (const d of c.datasets)
    checks.push({
      nome: `${d.year}: cobertura coerente (${d.complete ? 'ano completo' : 'ano parcial'})`,
      ok: d.complete ? d.last_complete_month === 12 && d.months_covered === 12 : d.last_complete_month < 12 && d.months_covered === d.last_complete_month && d.last_complete_month > 0,
      detalhe: `meses ${d.first_month}–${d.last_month}, último completo ${d.last_complete_month}`,
    });
  const evOk = c.eventos.every((e) => e.pct_in_peak_days >= 0 && e.pct_in_peak_days <= 100 && e.bos >= 0 && e.peak_days >= 0);
  checks.push({ nome: 'event_venues: contagens e % entre 0 e 100', ok: evOk, detalhe: `${c.eventos.length} linhas (${new Set(c.eventos.map((e) => e.name)).size} locais × ${anos.length} anos)` });

  // 2. números oficiais
  console.log('\nContando os totais da capital por ano estatístico...');
  const nossos = contarNossos(REGRAS_PADRAO, anos);
  const oficiais = await lerOficiais();

  // 3. banco (do data:comparar-banco)
  const fBanco = path.join(outDir, 'comparacao_banco_2025.json');
  const banco = fs.existsSync(fBanco) ? (JSON.parse(fs.readFileSync(fBanco, 'utf-8')) as Record<string, any>) : null;
  const bancoAtual = banco && banco.passos.some((p: { passo: string }) => p.passo === 'v6_geocodificacao');

  // 4. amostras e mapa
  console.log('Sorteando as amostras e montando o mapa...');
  const amostras = amostrar(proc.excluir);
  escreverAmostras(amostras);
  escreverMapa(path.join(outDir, 'consolidado', 'linha_de_base_etapa1', 'hex_stats.ndjson.gz'), path.join(c.pasta, 'hex_stats.ndjson.gz'), anos);

  // 5. volume
  const vol = estimarHexStats(c.linhas);

  // ------------------------------------------------------------------------------------- relatório
  const md: string[] = [];
  const L = (s = '') => md.push(s);
  const falhas = checks.filter((x) => !x.ok);
  L('# Verificação dos dados (Fase 3.7, Etapa 4)');
  L();
  L(`Gerado em ${new Date().toISOString().slice(0, 16).replace('T', ' ')} por \`npm run data:verificar\`. Regras finais: BO uma vez na categoria mais grave, Tema 506, pontos padrão, geocodificação pelo CNEFE (níveis aprovados), escala fixa (cortes de 2023–2025) e 2026 anualizado pela sazonalidade.`);
  L();
  L(`**Resultado: ${falhas.length ? `${falhas.length} checagem(ns) falhando` : `todas as ${checks.length} checagens automáticas passaram`}.**`);
  L();
  L('## 1. Invariantes');
  L();
  L('| | Checagem | Detalhe |');
  L('|---|---|---|');
  for (const x of checks) L(`| ${x.ok ? '✓' : '✗'} | ${x.nome} | ${String(x.detalhe).replace(/\|/g, '/')} |`);
  L();
  L('Média dos 4 períodos e das 24 horas × dia inteiro, por resolução (todos os hexágonos × ano com BO):');
  L();
  L('| Resolução | Hexágonos × ano | Períodos: desvio médio da densidade | Períodos: diferença média de nível | Períodos: até 1 nível | Horas: desvio médio | Horas: diferença de nível | Horas: até 1 nível |');
  L('|---|---|---|---|---|---|---|---|');
  for (const [res, v] of Object.entries(r.periodosVsDia as Record<string, any>))
    L(`| ${res} | ${fmt(v.hexagonos_ano)} | ${v.periodos.desvio_medio_densidade_pct}% | ${v.periodos.diferenca_media_de_nivel} | ${v.periodos.ate_1_nivel_pct}% | ${v.horas.desvio_medio_densidade_pct}% | ${v.horas.diferenca_media_de_nivel} | ${v.horas.ate_1_nivel_pct}% |`);
  L();
  L(`Fatores da cidade por ano: ${anos.map((a) => `${a} período ${r.fatores[a].periodo.toFixed(3)} / hora ${r.fatores[a].hora.toFixed(3)}`).join('; ')}. Anualização de 2026: ${Object.entries(r.anualizacao.porAno as Record<string, any>).filter(([, a]) => a.meses < 12).map(([ano, a]) => `${ano}, meses 1–${a.meses}, fração ${a.fracaoMedia} → fator ${a.fator} (linear seria ${a.fatorLinear})`).join('; ')}.`);
  L();
  L('Cobertura (`datasets`):');
  L();
  L('| Ano | Meses | Último mês completo | BOs com ponto | Pelo endereço | Trocados | Sem localização |');
  L('|---|---|---|---|---|---|---|');
  for (const d of c.datasets) L(`| ${d.year} | ${d.first_month}–${d.last_month} | ${d.last_complete_month} | ${fmt(d.rows_valid as number)} | ${fmt(d.rows_geocoded as number)} | ${fmt(d.rows_swapped as number)} | ${fmt(d.rows_no_location as number)} |`);
  L();

  L('## 2. Números oficiais da SSP');
  L();
  L('Nossos totais: todas as linhas da capital (COD IBGE 3550308, com e sem coordenada), pelo `ANO_ESTATISTICA`/`MES_ESTATISTICA`; um BO conta uma vez em cada categoria que ele tem.');
  if (nossos.semAnoEstatistico) L(`(${fmt(nossos.semAnoEstatistico)} linhas sem ano estatístico usaram a data de registro.)`);
  L();
  const temOficial = Object.keys(oficiais.porAno).length > 0;
  L(`| Categoria | ${anos.map((a) => (temOficial ? `${a} nosso | ${a} SSP | dif.` : `${a}`)).join(' | ')} |`);
  L(`|---|${anos.map(() => (temOficial ? '---|---|---|' : '---|')).join('')}`);
  const diferencas: string[] = [];
  for (const cat of CATEGORIAS_OFICIAIS) {
    const cel = anos.map((a) => {
      const meses = nossos.contagem[a]?.[cat.categoria] ?? Array(12).fill(0);
      const of = oficiais.porAno[a]?.[cat.categoria];
      // ano parcial: compara só os meses que existem nos dois
      const ate = of ? Math.max(...of.map((x, i) => (x > 0 ? i + 1 : 0))) : 12;
      const n = soma(meses.slice(0, ate));
      if (!temOficial) return fmt(soma(meses));
      if (!of) return `${fmt(n)} | - | -`;
      const o = soma(of.slice(0, ate));
      const d = o ? (100 * (n - o)) / o : 0;
      if (Math.abs(d) > 5) diferencas.push(`${cat.rotulo} ${a}${ate < 12 ? ` (meses 1–${ate})` : ''}: ${fmt(n)} × ${fmt(o)} (${d > 0 ? '+' : ''}${d.toFixed(1)}%)`);
      return `${fmt(n)} | ${fmt(o)} | ${d > 0 ? '+' : ''}${d.toFixed(1)}%`;
    });
    L(`| ${cat.rotulo} | ${cel.join(' | ')} |`);
  }
  L();
  if (!temOficial) {
    L(`**Pendente:** nenhum arquivo em \`${path.relative(path.join(outDir, '..', '..'), pastaOficial())}\`. O que baixar está no fim deste arquivo.`);
  } else {
    L(`Arquivos lidos: ${oficiais.arquivos.join(', ')}.${oficiais.erros.length ? ` Erros: ${oficiais.erros.join('; ')}.` : ''}`);
    L();
    L(diferencas.length ? `Diferenças maiores que 5% (a explicar): ${diferencas.join('; ')}.` : 'Nenhuma diferença maior que 5%.');
  }
  L();

  L('## 3. Comparação com o banco atual (2025)');
  L();
  if (!banco) L('Rode `npm run data:comparar-banco` (só lê o Supabase) para preencher esta parte.');
  else {
    if (!bancoAtual) L('_O arquivo é anterior ao passo da geocodificação: rode `npm run data:comparar-banco` de novo._');
    L('Hexágonos que mudam de nível em cada passo (↑ subiram / ↓ desceram), contra a grade inteira do banco:');
    L();
    L('| Passo | res 7 | res 8 | res 9 |');
    L('|---|---|---|---|');
    for (const p of banco.passos)
      L(`| ${p.passo}: ${p.motivo} | ${RESOLUTIONS.map((res) => `${p.porResolucao[res].mudaram} (↑${p.porResolucao[res].subiram} ↓${p.porResolucao[res].desceram})`).join(' | ')} |`);
    L();
    L('20 hexágonos (res 8) que mais mudaram, com o passo que mais mexeu em cada um:');
    L();
    L('| Hexágono | Banco → final | Trilha | BOs banco → final | Motivo principal |');
    L('|---|---|---|---|---|');
    for (const t of banco.top20_res8) L(`| \`${t.h3}\` | ${t.nivelBanco} → ${t.nivelNovo} | ${t.trilha} | ${fmt(t.boBanco)} → ${fmt(t.boNovo)} | ${t.motivoPrincipal} |`);
  }
  L();

  L('## 4. Amostras e mapa');
  L();
  const am = Object.values(amostras).flat();
  const origens = new Map<string, number>();
  for (const a of am) origens.set(a.origem.split(':')[0], (origens.get(a.origem.split(':')[0]) ?? 0) + 1);
  L(`- \`scripts/out/verificacao_amostras.csv\`: ${am.length} BOs com ponto (${POR_ANO} por ano, sorteio com semente fixa), com categoria, endereço da planilha, origem da coordenada (${[...origens].map(([k, n]) => `${k} ${n}`).join(', ')}), hexágonos res 8/9 e link do Google Maps. Fica só no computador.`);
  L(`- \`scripts/out/verificacao_mapa.html\`: antes (Etapa 1, só coordenadas da SSP) × depois (final) para ${LUGARES.map((l) => l.nome).join(', ')}, por ano, no dia inteiro, nos 4 períodos e por hora (hexágonos res 9 num raio de ~1,2 km).`);
  L();

  L('## 5. Volume no banco');
  L();
  L('| Tabela | Linhas | Tamanho estimado |');
  L('|---|---|---|');
  L(`| hex_stats | ${fmt(vol.linhas)} | ~${Math.round(vol.totalMB)} MB (dados ~${Math.round(vol.dadosMB)} MB, índices ~${Math.round(vol.indicesMB)} MB; \`counts\` ~${Math.round(vol.jsonbMedioB)} bytes por linha) |`);
  L(`| datasets | ${c.datasets.length} | < 0,1 MB |`);
  L(`| level_breaks | ${RESOLUTIONS.length} | < 0,1 MB |`);
  L(`| event_venues | ${c.eventos.length} | < 0,1 MB |`);
  L(`| hex_cells (+ area_km2, espelho do ano padrão) | ${fmt([...grade.values()].reduce((a, s) => a + s.size, 0))} | +~1 MB (e ~o tamanho atual a mais até o autovacuum, por reescrever as linhas) |`);
  L();
  L(`Hoje o banco tem ~40 MB; com hex_stats fica perto de ~${Math.round(40 + vol.totalMB)} MB, dentro dos 500 MB do plano grátis.`);
  L();

  L('## O que baixar da SSP (números oficiais)');
  L();
  L('1. Abra https://www.ssp.sp.gov.br/estatistica/dados-mensais (menu **Estatística → Dados Mensais**; se o menu mudou, a página com a tabela "Ocorrências registradas por mês").');
  L('2. Filtros: **Região = Capital**, **Município = São Paulo**, **Delegacia = Todas** (o total do município), **Ano** = 2023 (depois 2024, 2025 e 2026).');
  L('3. A tabela vem com as naturezas nas linhas (HOMICÍDIO DOLOSO, LATROCÍNIO, TOTAL DE ESTUPRO, ROUBO DE VEÍCULO, FURTO DE VEÍCULO, ROUBO - OUTROS, FURTO - OUTROS…) e os meses nas colunas. Use o botão de exportar/baixar (Excel ou CSV).');
  L('4. Salve um arquivo por ano em `data/SSP-SP/oficial/`, com o ano no nome: `ocorrencias_capital_2023.xlsx`, `..._2024.xlsx`, `..._2025.xlsx`, `..._2026.xlsx` (CSV também serve). Se não houver botão de exportar, copie a tabela inteira (com o cabeçalho dos meses) para uma planilha e salve como xlsx.');
  L('5. Rode `npm run data:verificar` de novo: a seção 2 passa a comparar e listar as diferenças maiores que 5%.');
  L();
  L(`_Tempo: ${Math.round((Date.now() - t0) / 1000)} s._`);
  fs.writeFileSync(path.join(outDir, 'verificacao.md'), md.join('\n'));

  console.log(`\n${checks.filter((x) => x.ok).length}/${checks.length} checagens ok`);
  for (const x of falhas) console.log(`  ✗ ${x.nome} — ${x.detalhe}`);
  console.log(`Relatório: ${path.join(outDir, 'verificacao.md')}`);
  if (falhas.length) process.exit(2);
}

main().catch((err) => {
  console.error(process.env.DEBUG && err instanceof Error ? err.stack : err instanceof Error ? err.message : err);
  process.exit(1);
});

