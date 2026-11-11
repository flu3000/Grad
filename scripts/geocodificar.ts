/**
 * Geocodificação local dos BOs pelo CNEFE (Etapa 2). Só lê arquivos locais; nenhum endereço sai do computador.
 *
 *   npm run data:geocodificar      (precisa de data:limpar e data:indice-cnefe)
 *
 * 1. Lê as partes limpas: monta as consultas únicas (logradouro, número, bairro, distrito do ponto da SSP) e conta
 *    os BOs por coordenada (detector de pontos padrão). Os locais de evento são medidos no processamento.
 * 2. Geocodifica o que não está no cache (scripts/out/cache/geocodificacao.jsonl).
 * 3. Calibra: distância entre o endereço geocodificado e a coordenada confiável da SSP (sem sigilo, fora dos
 *    pontos padrão, com 4+ casas decimais), por nível e ano. Duas variantes: com o distrito do ponto (como nos
 *    pontos suspeitos) e só com o BAIRRO (como nos BOs sem coordenada; amostra de 1 em 5).
 * 4. Grava os resultados dos candidatos para o processamento (geocodificacao_candidatos.json), o relatório e a
 *    conferência: scripts/out/verificacao_coordenadas.csv e .html.
 */
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import { GEOCODIFICACAO } from './src/config/geocodificacao';
import { CHAVES_PONTOS_PADRAO, chavePonto, DETECTOR_PONTO_PADRAO } from './src/config/pontosPadrao';
import { normalizeText } from './src/config/crimeWeights';
import { analisarLogradouro, distanciaM } from './src/lib/endereco';
import { arquivoIndice, Geocodificador, lerIndice, type Consulta, type Resultado } from './src/lib/geocodificador';
import { lerLinhaCsv, type LinhaLimpa } from './src/lib/limpeza';
import { carregarMunicipio } from './src/lib/municipio';
import { outDir } from './src/lib/paths';
import { lerManifesto, partesDoManifesto, pastaLimpo } from './src/pipeline/extracao';
import {
  arquivoCache,
  arquivoCandidatos,
  casasDecimais,
  chaveConsulta,
  consultaDe,
  decidir,
  ehCandidato,
  podeGeocodificar,
  situacaoDoPonto,
} from './src/pipeline/geocodificacao';
import { classificar, REGRAS_PADRAO } from './src/pipeline/processamento';

const ANOS = new Set(REGRAS_PADRAO.anos);
const AMOSTRA_BAIRRO = 5; // 1 em 5 BOs confiáveis entra na calibração "só com o BAIRRO"
const POR_TIPO = 100;

function* linhasDasPartes(): Generator<LinhaLimpa> {
  for (const p of partesDoManifesto(lerManifesto())) {
    const texto = zlib.gunzipSync(fs.readFileSync(path.join(pastaLimpo(), p.arquivo))).toString('utf-8');
    let i = texto.indexOf('\n') + 1;
    while (i < texto.length) {
      let j = texto.indexOf('\n', i);
      if (j < 0) j = texto.length;
      if (j > i) yield lerLinhaCsv(texto.slice(i, j));
      i = j + 1;
    }
  }
}

const anoDe = (l: LinhaLimpa) => (l.data_ocorrencia ? Number(l.data_ocorrencia.slice(0, 4)) : null);
const amostraBairro = (l: LinhaLimpa) => !!l.id_bo && parseInt(l.id_bo.slice(0, 6), 16) % AMOSTRA_BAIRRO === 0;

/** Gerador pseudoaleatório com semente (amostras reprodutíveis). */
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

class Reservatorio<T> {
  itens: T[] = [];
  vistos = 0;
  constructor(
    private n: number,
    private rnd: () => number,
  ) {}
  add(x: T) {
    this.vistos++;
    if (this.itens.length < this.n) this.itens.push(x);
    else {
      const j = Math.floor(this.rnd() * this.vistos);
      if (j < this.n) this.itens[j] = x;
    }
  }
}

const quantil = (xs: number[], q: number) => (xs.length ? xs[Math.min(xs.length - 1, Math.floor(q * xs.length))] : NaN);
const r1 = (x: number) => Math.round(x * 10) / 10;

function resumoDistancias(ds: number[], acertosDistrito: number) {
  const s = [...ds].sort((a, b) => a - b);
  return {
    n: s.length,
    mediana_m: Math.round(quantil(s, 0.5)),
    p75_m: Math.round(quantil(s, 0.75)),
    p90_m: Math.round(quantil(s, 0.9)),
    abaixo_150m_pct: r1((100 * s.filter((d) => d < 150).length) / Math.max(1, s.length)),
    acima_1km_pct: r1((100 * s.filter((d) => d > 1000).length) / Math.max(1, s.length)),
    mesmo_distrito_pct: r1((100 * acertosDistrito) / Math.max(1, s.length)),
  };
}

// ----------------------------------------------------------------------------------------------- cache

function cabecalhoDoCache() {
  const fontes = ['src/lib/endereco.ts', 'src/lib/geocodificador.ts', 'src/config/enderecosConhecidos.ts'].map((f) => fs.readFileSync(path.join(__dirname, f), 'utf-8')).join('\n');
  const st = fs.statSync(arquivoIndice());
  return { versao: 1, indice: `${st.size}:${st.mtimeMs}`, codigo: crypto.createHash('sha1').update(fontes).digest('hex').slice(0, 12) };
}

function lerCache(): Map<string, Resultado> {
  const f = arquivoCache();
  const mapa = new Map<string, Resultado>();
  if (!fs.existsSync(f)) return mapa;
  const linhas = fs.readFileSync(f, 'utf-8').split('\n');
  if (linhas[0] !== JSON.stringify(cabecalhoDoCache())) {
    console.log('  Cache de geocodificação de outra versão do índice ou do código: refazendo.');
    return mapa;
  }
  for (const l of linhas.slice(1)) {
    if (!l) continue;
    const [k, r] = JSON.parse(l) as [string, Resultado];
    mapa.set(k, r);
  }
  return mapa;
}

// ------------------------------------------------------------------------------------------- principal

interface Caso {
  tipo: string;
  ano: number;
  data: string;
  categoria: string;
  logradouro: string;
  numero: number | null;
  bairro: string;
  nivel: string;
  aceito: boolean;
  cnefe: string;
  lat_ssp: number | null;
  lng_ssp: number | null;
  lat_final: number;
  lng_final: number;
  distancia_m: number | null;
}

async function main() {
  const t0 = Date.now();
  const seg = (t: number) => Math.round((Date.now() - t) / 1000);
  const municipio = carregarMunicipio();
  const geo = new Geocodificador(lerIndice());
  const segIndice = seg(t0);
  console.log(`Índice do CNEFE carregado (${segIndice} s): ${geo.indice.instancias.length} logradouros`);

  // ---------------------------------------------------------------- passada 1: consultas, pontos, eventos
  const t1 = Date.now();
  const consultas = new Map<string, Consulta>();
  const candidatas = new Set<string>();
  const porPonto = new Map<string, number>();
  const pontosSuspeitosContagem = { linhas: 0 };
  let linhas = 0;
  for (const l of linhasDasPartes()) {
    const ano = anoDe(l);
    if (!ano || !ANOS.has(ano)) continue;
    linhas++;
    const categoria = classificar(l.rubrica, l.natureza, REGRAS_PADRAO);
    const s = situacaoDoPonto(l, true, municipio.distritoDe);
    if (s.temCoordenada && !s.foraDoMunicipio && (s.pontoPadrao || !s.suspeito)) {
      const k = chavePonto(l.lat!, l.lng!);
      porPonto.set(k, (porPonto.get(k) ?? 0) + 1);
    }
    if (s.suspeito) pontosSuspeitosContagem.linhas++;
    const usavel = s.temCoordenada && !s.pontoPadrao && !s.foraDoMunicipio;
    if (!podeGeocodificar(l, categoria) || s.foraDoMunicipio) continue;
    const q = consultaDe(l, s.distrito);
    const k = chaveConsulta(q);
    consultas.set(k, q);
    if (ehCandidato(s)) candidatas.add(k);
    if (usavel && !s.suspeito && amostraBairro(l)) {
      const qb = consultaDe(l, null);
      consultas.set(chaveConsulta(qb), qb);
    }
  }
  const segPassada1 = seg(t1);
  console.log(`Passada 1 (${segPassada1} s): ${linhas} linhas de ${[...ANOS].join(', ')}; ${consultas.size} consultas únicas, ${candidatas.size} de candidatos`);

  // ------------------------------------------------------------------------- geocodificação (com cache)
  const t2 = Date.now();
  const cache = lerCache();
  const novas = [...consultas.keys()].filter((k) => !cache.has(k));
  const cab = JSON.stringify(cabecalhoDoCache());
  fs.mkdirSync(path.dirname(arquivoCache()), { recursive: true });
  if (!cache.size) fs.writeFileSync(arquivoCache(), cab + '\n');
  const fd = fs.openSync(arquivoCache(), 'a');
  let buf: string[] = [];
  novas.forEach((k, i) => {
    const r = geo.geocodificar(consultas.get(k)!);
    cache.set(k, r);
    buf.push(JSON.stringify([k, r]));
    if (buf.length >= 20_000 || i === novas.length - 1) {
      fs.writeSync(fd, buf.join('\n') + '\n');
      buf = [];
      process.stdout.write(`  geocodificadas ${i + 1}/${novas.length}\r`);
    }
  });
  fs.closeSync(fd);
  const segGeo = seg(t2);
  console.log(`\nGeocodificação (${segGeo} s): ${novas.length} novas, ${consultas.size - novas.length} do cache`);

  // Resultados dos candidatos para o estágio B.
  fs.writeFileSync(arquivoCandidatos(), JSON.stringify(Object.fromEntries([...candidatas].map((k) => [k, cache.get(k)!]))));

  // ---------------------------------------------------------- passada 2: calibração, conferência, pontos
  const t3 = Date.now();
  const rnd = aleatorio(20261110);
  type Grupo = { ds: number[]; acertos: number };
  const calib: Record<string, Record<string, Record<string, Grupo>>> = { ponto: {}, bairro: {} };
  const cobertura: Record<string, Record<string, Record<string, number>>> = { ponto: {}, bairro: {} };
  const nivelCalib = (r: Resultado) => (r.nivel!.startsWith('interpolado') ? r.nivel!.replace('interpolado', `interpolado_${r.lados}lado${r.lados === 1 ? '' : 's'}`) : r.nivel!);
  const reg = (variante: 'ponto' | 'bairro', ano: number, r: Resultado, l: LinhaLimpa, distrito: string) => {
    const cob = ((cobertura[variante][ano] ??= {}));
    const chaveCob = r.ok ? nivelCalib(r) : `falha:${r.falha}`;
    cob[chaveCob] = (cob[chaveCob] ?? 0) + 1;
    if (!r.ok) return;
    const nivel = variante === 'bairro' ? `${nivelCalib(r)} [dica: ${r.dica ?? 'nenhuma'}]` : nivelCalib(r);
    for (const a of [String(ano), 'todos']) {
      const g = ((calib[variante][nivel] ??= {})[a] ??= { ds: [], acertos: 0 });
      g.ds.push(distanciaM(l.lat!, l.lng!, r.lat!, r.lng!));
      if (municipio.distritoDe(r.lat!, r.lng!) === distrito) g.acertos++;
    }
  };
  const tipos = ['preenchido_conhecido', 'preenchido_exato', 'preenchido_interpolado', 'preenchido_curto', 'preenchido_aproximado', 'trocado', 'divergente_mantido'];
  // O que o curto e os endereços conhecidos acrescentam (BOs preenchidos por ano, categoria e logradouro).
  const curto = { porAno: {} as Record<string, number>, porCategoria: {} as Record<string, Record<string, number>>, logradouros: new Map<string, { n: number; porAno: Record<string, number>; estacao: number }>() };
  const conhecidos = new Map<string, Record<string, number>>();
  const ehEstacao = (l: LinhaLimpa) => /METROVI|FERROVI|TERMINAL|ESTACAO/.test(normalizeText(`${l.tipo_local ?? ''} ${l.subtipo_local ?? ''}`));
  const amostras = Object.fromEntries(tipos.map((t) => [t, new Reservatorio<Caso>(POR_TIPO, rnd)]));
  const divergencia: Record<string, { comparados: number; acima300: number; acima1km: number }> = {};
  const candidatosPorAno: Record<string, Record<string, number>> = {};
  const detectar = new Set([...porPonto].filter(([, n]) => n >= DETECTOR_PONTO_PADRAO.minBos).map(([k]) => k));
  const detalhePonto = new Map<string, { bos: Set<string>; chaves: Map<string, number>; porAno: Record<string, number>; distrito: string | null }>();
  const chaveDoTexto = new Map<string, string>();
  const regrasGeo = GEOCODIFICACAO;
  const geocodificar = (q: Consulta) => cache.get(chaveConsulta(q)) ?? null;
  for (const l of linhasDasPartes()) {
    const ano = anoDe(l);
    if (!ano || !ANOS.has(ano)) continue;
    const categoria = classificar(l.rubrica, l.natureza, REGRAS_PADRAO);
    const s = situacaoDoPonto(l, true, municipio.distritoDe);
    // detector: coordenadas com muitos BOs
    if (s.temCoordenada) {
      const kp = chavePonto(l.lat!, l.lng!);
      if (detectar.has(kp)) {
        const d = detalhePonto.get(kp) ?? { bos: new Set<string>(), chaves: new Map<string, number>(), porAno: {} as Record<string, number>, distrito: municipio.distritoDe(l.lat!, l.lng!) };
        detalhePonto.set(kp, d);
        d.bos.add(l.id_bo ?? `${l.arquivo}:${l.linha}`);
        let ch = chaveDoTexto.get(l.logradouro ?? '');
        if (ch === undefined) chaveDoTexto.set(l.logradouro ?? '', (ch = l.logradouro ? analisarLogradouro(l.logradouro).chave : ''));
        d.chaves.set(ch, (d.chaves.get(ch) ?? 0) + 1);
        d.porAno[ano] = (d.porAno[ano] ?? 0) + 1;
      }
    }
    if (!podeGeocodificar(l, categoria) || s.foraDoMunicipio) continue;
    const usavel = s.temCoordenada && !s.pontoPadrao;
    const r = cache.get(chaveConsulta(consultaDe(l, s.distrito)))!;
    // calibração e divergência (pontos confiáveis)
    if (usavel && !s.suspeito) {
      reg('ponto', ano, r, l, s.distrito!);
      if (amostraBairro(l)) reg('bairro', ano, cache.get(chaveConsulta(consultaDe(l, null)))!, l, s.distrito!);
      const dec = decidir(l, categoria, s, regrasGeo, geocodificar, municipio.distritoDe, true);
      if (dec.origem === 'ssp' && dec.distanciaM !== null) {
        const dv = (divergencia[ano] ??= { comparados: 0, acima300: 0, acima1km: 0 });
        dv.comparados++;
        if (dec.distanciaM > regrasGeo.trocarAcimaDeM) {
          dv.acima300++;
          amostras.divergente_mantido.add(caso('divergente_mantido', l, ano, categoria, r, true, dec.distanciaM));
        }
        if (dec.distanciaM > 1000) dv.acima1km++;
      }
      continue;
    }
    // candidatos: sem coordenada, ponto padrão ou ponto suspeito
    const cp = (candidatosPorAno[ano] ??= {});
    const tipoCand = !s.temCoordenada ? 'sem_coordenada' : s.pontoPadrao ? 'ponto_padrao' : 'suspeito';
    cp[tipoCand] = (cp[tipoCand] ?? 0) + 1;
    const dec = decidir(l, categoria, s, regrasGeo, geocodificar, municipio.distritoDe);
    if (dec.origem === 'preenchido' && dec.geo.nivel === 'curto') {
      curto.porAno[ano] = (curto.porAno[ano] ?? 0) + 1;
      const pc = (curto.porCategoria[categoria] ??= {});
      pc[ano] = (pc[ano] ?? 0) + 1;
      const k = `${dec.geo.cnefe} (${l.bairro ?? 'sem bairro'})`;
      const x = curto.logradouros.get(k) ?? { n: 0, porAno: {}, estacao: 0 };
      curto.logradouros.set(k, x);
      x.n++;
      x.porAno[ano] = (x.porAno[ano] ?? 0) + 1;
      if (ehEstacao(l)) x.estacao++;
    }
    if (dec.origem === 'preenchido' && dec.geo.nivel === 'conhecido') {
      const c = conhecidos.get(dec.geo.cnefe!) ?? {};
      conhecidos.set(dec.geo.cnefe!, c);
      c[ano] = (c[ano] ?? 0) + 1;
    }
    if (dec.origem === 'trocado') amostras.trocado.add(caso('trocado', l, ano, categoria, r, true, dec.distanciaM));
    else if (!usavel || s.pontoPadrao) {
      if (r.ok && municipio.distritoDe(r.lat!, r.lng!)) {
        const base = r.nivel!.endsWith('_aproximado') ? 'aproximado' : r.nivel!;
        amostras[`preenchido_${base}`]?.add(caso(`preenchido_${base}`, l, ano, categoria, r, dec.origem === 'preenchido', s.pontoPadrao ? distanciaM(l.lat!, l.lng!, r.lat!, r.lng!) : null));
      }
    }
  }
  const segPassada2 = seg(t3);

  function caso(tipo: string, l: LinhaLimpa, ano: number, categoria: string, r: Resultado, aceito: boolean, d: number | null): Caso {
    return {
      tipo,
      ano,
      data: l.data_ocorrencia ?? '',
      categoria,
      logradouro: l.logradouro ?? '',
      numero: l.numero,
      bairro: l.bairro ?? '',
      nivel: r.nivel ?? '',
      aceito,
      cnefe: r.cnefe ?? '',
      lat_ssp: l.lat,
      lng_ssp: l.lng,
      lat_final: Number(r.lat!.toFixed(6)),
      lng_final: Number(r.lng!.toFixed(6)),
      distancia_m: d === null ? null : Math.round(d),
    };
  }

  // ------------------------------------------------------------------------------------------- relatórios
  const calibracao = Object.fromEntries(
    Object.entries(calib).map(([v, porNivel]) => [
      v,
      Object.fromEntries(Object.entries(porNivel).map(([nivel, porAno]) => [nivel, Object.fromEntries(Object.entries(porAno).map(([a, g]) => [a, resumoDistancias(g.ds, g.acertos)]))])),
    ]),
  );
  const pontos = [...detalhePonto]
    .map(([k, d]) => {
      const [lat, lng] = k.split(',').map(Number);
      return {
        lat,
        lng,
        bos: d.bos.size,
        linhas: Object.values(d.porAno).reduce((a, b) => a + b, 0),
        logradouros_distintos: d.chaves.size,
        razao: Number((d.chaves.size / d.bos.size).toFixed(3)),
        por_ano: d.porAno,
        distrito: d.distrito,
        casas: Math.max(casasDecimais(lat), casasDecimais(lng)),
        confirmado: CHAVES_PONTOS_PADRAO.has(k),
        logradouros_mais_comuns: [...d.chaves].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([c, n]) => `${c || '(vazio)'} (${n})`),
        google: `https://www.google.com/maps?q=${lat},${lng}`,
      };
    })
    .filter((p) => p.bos >= DETECTOR_PONTO_PADRAO.minBos)
    .sort((a, b) => b.bos - a.bos);
  const detectados = pontos.filter((p) => p.razao >= DETECTOR_PONTO_PADRAO.razaoMinima);
  const quase = pontos.filter((p) => p.razao < DETECTOR_PONTO_PADRAO.razaoMinima && p.razao >= 0.25).slice(0, 15);

  const curtoRelatorio = {
    por_ano: curto.porAno,
    por_categoria: curto.porCategoria,
    top20_logradouros: [...curto.logradouros]
      .sort((a, b) => b[1].n - a[1].n)
      .slice(0, 20)
      .map(([k, x]) => ({ logradouro: k, bos: x.n, por_ano: x.porAno, estacao_ou_terminal_pct: Math.round((100 * x.estacao) / x.n) })),
  };
  const somaObj = (o: Record<string, number>) => Object.values(o).reduce((x, y) => x + y, 0);
  const conhecidosRelatorio = Object.fromEntries([...conhecidos].sort((a, b) => somaObj(b[1]) - somaObj(a[1])));

  const casos = tipos.flatMap((t) => amostras[t].itens);
  const relatorio = {
    gerado_em: new Date().toISOString(),
    regras: GEOCODIFICACAO,
    indice: geo.indice.contagens,
    consultas_unicas: consultas.size,
    consultas_de_candidatos: candidatas.size,
    pontos_suspeitos_linhas: pontosSuspeitosContagem.linhas,
    calibracao,
    cobertura_dos_pontos_confiaveis: cobertura,
    divergencia_dos_pontos_confiaveis: divergencia,
    candidatos_por_ano: candidatosPorAno,
    pontos_padrao: { criterio: DETECTOR_PONTO_PADRAO, detectados, quase_no_limite: quase },
    curto: curtoRelatorio,
    conhecidos: conhecidosRelatorio,
    amostras: Object.fromEntries(tipos.map((t) => [t, { casos: amostras[t].itens.length, populacao: amostras[t].vistos }])),
    tempos_s: { indice: segIndice, passada1: segPassada1, geocodificacao: segGeo, passada2: segPassada2, total: seg(t0) },
    cache: { arquivo: arquivoCache(), mb: Number((fs.statSync(arquivoCache()).size / 1e6).toFixed(1)), candidatos_mb: Number((fs.statSync(arquivoCandidatos()).size / 1e6).toFixed(1)) },
  };
  const pasta = path.join(outDir, 'geocodificacao');
  fs.mkdirSync(pasta, { recursive: true });
  fs.writeFileSync(path.join(pasta, 'relatorio.json'), JSON.stringify(relatorio, null, 2));
  escreverCsv(casos);
  escreverHtml(casos);
  imprimir(relatorio as unknown as Relatorio);
}

type Relatorio = Record<string, any>;

const gmaps = (lat: number | null, lng: number | null) => (lat === null || lng === null ? '' : `https://www.google.com/maps?q=${lat},${lng}`);

function escreverCsv(casos: Caso[]) {
  const cols = ['tipo', 'ano', 'data', 'categoria', 'logradouro', 'numero', 'bairro', 'nivel', 'aceito', 'cnefe', 'lat_ssp', 'lng_ssp', 'lat_final', 'lng_final', 'distancia_m', 'google_ssp', 'google_final'];
  const esc = (v: unknown) => {
    const s = v === null || v === undefined ? '' : String(v);
    return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const linhas = casos.map((c) => [...cols.slice(0, 15).map((k) => (c as unknown as Record<string, unknown>)[k]), gmaps(c.lat_ssp, c.lng_ssp), gmaps(c.lat_final, c.lng_final)].map(esc).join(','));
  fs.writeFileSync(path.join(outDir, 'verificacao_coordenadas.csv'), '﻿' + [cols.join(','), ...linhas].join('\n'));
}

function escreverHtml(casos: Caso[]) {
  const dados = JSON.stringify(casos).replace(/</g, '\\u003c');
  const html = `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Conferência das coordenadas</title>
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css">
<style>
  html, body { margin: 0; height: 100%; font: 14px system-ui, sans-serif; }
  #barra { padding: 8px 12px; display: flex; gap: 12px; align-items: center; flex-wrap: wrap; border-bottom: 1px solid #ccc; }
  #mapa { position: absolute; top: 48px; bottom: 0; left: 0; right: 0; }
  .leg { display: inline-flex; align-items: center; gap: 4px; }
  .bola { width: 10px; height: 10px; border-radius: 50%; display: inline-block; }
</style></head><body>
<div id="barra">
  <label>Tipo <select id="tipo"><option value="">todos</option></select></label>
  <label>Ano <select id="ano"><option value="">todos</option></select></label>
  <span id="n"></span>
  <span class="leg"><span class="bola" style="background:#d33"></span> SSP</span>
  <span class="leg"><span class="bola" style="background:#27c"></span> final (CNEFE)</span>
  <small>Arquivo local (endereços de BOs): não publicar. O mapa de fundo vem do OpenStreetMap.</small>
</div>
<div id="mapa"></div>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<script>
const CASOS = ${dados};
const mapa = L.map('mapa').setView([-23.55, -46.63], 11);
L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap' }).addTo(mapa);
const camada = L.layerGroup().addTo(mapa);
const sel = (id, vals) => { const s = document.getElementById(id); vals.forEach(v => { const o = document.createElement('option'); o.value = o.textContent = v; s.appendChild(o); }); s.onchange = desenhar; };
sel('tipo', [...new Set(CASOS.map(c => c.tipo))]);
sel('ano', [...new Set(CASOS.map(c => String(c.ano)))].sort());
const g = (a, b) => 'https://www.google.com/maps?q=' + a + ',' + b;
const esc = s => String(s ?? '').replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
function desenhar() {
  camada.clearLayers();
  const t = document.getElementById('tipo').value, a = document.getElementById('ano').value;
  const lista = CASOS.filter(c => (!t || c.tipo === t) && (!a || String(c.ano) === a));
  document.getElementById('n').textContent = lista.length + ' casos';
  const pts = [];
  for (const c of lista) {
    const txt = '<b>' + esc(c.tipo) + '</b> (' + esc(c.nivel) + (c.aceito ? '' : ', nível não aceito') + ')<br>' + esc(c.logradouro) + ', ' + esc(c.numero ?? 's/n') + ' — ' + esc(c.bairro) +
      '<br>CNEFE: ' + esc(c.cnefe) + '<br>' + esc(c.categoria) + ', ' + esc(c.data) + (c.distancia_m !== null ? '<br>distância: ' + c.distancia_m + ' m' : '') +
      (c.lat_ssp !== null ? '<br><a target="_blank" href="' + g(c.lat_ssp, c.lng_ssp) + '">SSP no Google Maps</a>' : '') +
      '<br><a target="_blank" href="' + g(c.lat_final, c.lng_final) + '">final no Google Maps</a>';
    const f = L.circleMarker([c.lat_final, c.lng_final], { radius: 5, color: '#27c', fillOpacity: 0.8 }).bindPopup(txt).addTo(camada);
    pts.push(f.getLatLng());
    if (c.lat_ssp !== null) {
      L.circleMarker([c.lat_ssp, c.lng_ssp], { radius: 5, color: '#d33', fillOpacity: 0.8 }).bindPopup(txt).addTo(camada);
      L.polyline([[c.lat_ssp, c.lng_ssp], [c.lat_final, c.lng_final]], { color: '#555', weight: 1 }).addTo(camada);
      pts.push(L.latLng(c.lat_ssp, c.lng_ssp));
    }
  }
  if (pts.length) mapa.fitBounds(L.latLngBounds(pts), { padding: [20, 20] });
}
desenhar();
</script></body></html>`;
  fs.writeFileSync(path.join(outDir, 'verificacao_coordenadas.html'), html);
}

function imprimir(r: Relatorio) {
  const L = console.log;
  L('\n================ CALIBRAÇÃO (coordenada confiável da SSP × endereço) ================');
  for (const v of ['ponto', 'bairro']) {
    L(`\nVariante "${v}" (${v === 'ponto' ? 'distrito do ponto da SSP no desempate, como nos pontos suspeitos' : 'só o BAIRRO, como nos BOs sem coordenada; amostra 1 em 5'}):`);
    L('  nível                          ano   |      n | mediana |  p75 |   p90 | <150m | >1km | mesmo distrito');
    for (const [nivel, porAno] of Object.entries(r.calibracao[v] as Record<string, Record<string, any>>).sort())
      for (const [ano, x] of Object.entries(porAno))
        L(`  ${nivel.padEnd(30)} ${ano.padEnd(5)} | ${String(x.n).padStart(6)} | ${String(x.mediana_m).padStart(5)} m | ${String(x.p75_m).padStart(4)} | ${String(x.p90_m).padStart(5)} | ${String(x.abaixo_150m_pct).padStart(4)}% | ${String(x.acima_1km_pct).padStart(4)}% | ${x.mesmo_distrito_pct}%`);
  }
  L('\nCobertura dos pontos confiáveis (nível alcançado ou motivo da falha), variante "ponto":');
  for (const [ano, c] of Object.entries(r.cobertura_dos_pontos_confiaveis.ponto as Record<string, Record<string, number>>)) {
    const tot = Object.values(c).reduce((a, b) => a + b, 0);
    L(`  ${ano} (${tot}): ${Object.entries(c).sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k} ${((100 * n) / tot).toFixed(1)}%`).join(' | ')}`);
  }
  L('\nDivergência dos pontos confiáveis (nível aceito; ficam com a coordenada da SSP):');
  for (const [ano, d] of Object.entries(r.divergencia_dos_pontos_confiaveis as Record<string, any>))
    L(`  ${ano}: ${d.comparados} comparados, ${d.acima300} a mais de 300 m (${((100 * d.acima300) / d.comparados).toFixed(1)}%), ${d.acima1km} a mais de 1 km`);
  L('\nCandidatos (podem usar o endereço) por ano:');
  for (const [ano, c] of Object.entries(r.candidatos_por_ano)) L(`  ${ano}: ${JSON.stringify(c)}`);
  L(`\nPontos padrão detectados (≥ ${r.pontos_padrao.criterio.minBos} BOs e logradouros distintos ÷ BOs ≥ ${r.pontos_padrao.criterio.razaoMinima}):`);
  for (const p of r.pontos_padrao.detectados)
    L(`  ${p.confirmado ? '[confirmado] ' : ''}${p.lat}, ${p.lng} | ${p.bos} BOs, ${p.logradouros_distintos} logradouros (razão ${p.razao}) | ${p.distrito} | ${JSON.stringify(p.por_ano)} | ${p.logradouros_mais_comuns.join('; ')}`);
  L('  Quase no limite (razão 0,25–0,5):');
  for (const p of r.pontos_padrao.quase_no_limite) L(`    ${p.lat}, ${p.lng} | ${p.bos} BOs, razão ${p.razao} | ${p.distrito} | ${p.logradouros_mais_comuns.join('; ')}`);
  const somaO = (o: Record<string, number>) => Object.values(o).reduce((p, q) => p + q, 0);
  L('\nCurto (centro de logradouro < 1 km, BAIRRO = distrito): BOs preenchidos por ano');
  L(`  ${JSON.stringify(r.curto.por_ano)}`);
  L('  por categoria:');
  for (const [c, x] of Object.entries(r.curto.por_categoria as Record<string, Record<string, number>>).sort((a, b) => somaO(b[1]) - somaO(a[1])))
    L(`    ${c.padEnd(20)} ${JSON.stringify(x)}`);
  L('  20 logradouros que mais recebem BOs pelo curto (% com local "Metroviário e Ferroviário" ou terminal):');
  for (const x of r.curto.top20_logradouros) L(`    ${String(x.bos).padStart(5)}  ${x.logradouro}  ${JSON.stringify(x.por_ano)}  estação/terminal ${x.estacao_ou_terminal_pct}%`);
  L('\nEndereços conhecidos (BOs preenchidos por ano):');
  for (const [n, x] of Object.entries(r.conhecidos as Record<string, Record<string, number>>)) L(`  ${n.padEnd(60)} ${JSON.stringify(x)}`);
  L(`\nAmostras para conferência: ${Object.entries(r.amostras).map(([t, a]: [string, any]) => `${t} ${a.casos}/${a.populacao}`).join(' | ')}`);
  L(`Tempos (s): ${JSON.stringify(r.tempos_s)} | cache ${r.cache.mb} MB, candidatos ${r.cache.candidatos_mb} MB`);
  L(`Arquivos: scripts/out/geocodificacao/relatorio.json, scripts/out/verificacao_coordenadas.csv e .html`);
}

main().catch((err) => {
  console.error(process.env.DEBUG && err instanceof Error ? err.stack : err instanceof Error ? err.message : err);
  process.exit(1);
});
