/**
 * Monta o índice de endereços do CNEFE 2022 (IBGE) para a geocodificação local:
 *   data/cnefe/3550308_SAO_PAULO.zip  →  data/cnefe/indice.json.gz
 *
 *   npm run data:indice-cnefe
 *
 * Lê o CSV de dentro do zip por streaming (tar.exe do Windows; `unzip -p` nos outros sistemas). NV_GEO_COORD
 * (dicionário do IBGE): 1 = coordenada original do Censo, 2 = modificada (apartamentos no mesmo número),
 * 3 = estimada, 4 = face de quadra, 5 = localidade, 6 = setor censitário. Os níveis 1 a 3 entram no índice por
 * número; o 4 só ajuda na extensão e no centro do logradouro; 5 e 6 ficam de fora.
 */
import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import readline from 'readline';
import zlib from 'zlib';
import { normalizarNome, normalizarTipo, tokens } from './src/lib/endereco';
import { arquivoIndice, extensaoM, mediana, VERSAO_INDICE, type IndiceCnefe, type Instancia } from './src/lib/geocodificador';
import { readGeoSampa } from './src/lib/city';
import { carregarMunicipio } from './src/lib/municipio';
import { dataDir } from './src/lib/paths';
import { normalizarBairro } from './src/lib/semLocalizacao';

const ZIP = path.join(dataDir(), 'cnefe', '3550308_SAO_PAULO.zip');
const CELULA = 0.005; // ~500 m: pontos do mesmo nome em células vizinhas são o mesmo logradouro

function abrirCsv() {
  if (!fs.existsSync(ZIP)) throw new Error(`CNEFE não encontrado: ${ZIP} (baixe do FTP do IBGE, ver data/README.md)`);
  const tarWin = 'C:/Windows/System32/tar.exe';
  const p = process.platform === 'win32' && fs.existsSync(tarWin) ? spawn(tarWin, ['-xOf', ZIP]) : spawn('unzip', ['-p', ZIP]);
  p.stderr.on('data', (d) => process.stderr.write(d));
  return p.stdout;
}

/** Distritos vizinhos: vértices a menos de ~50 m um do outro. */
function vizinhosDosDistritos(): Record<string, string[]> {
  const g = 0.0005;
  const grade = new Map<string, Set<string>>();
  const ds = readGeoSampa<{ nm_distrito_municipal: string }>('distritos');
  for (const f of ds) {
    const nome = normalizarBairro(f.properties.nm_distrito_municipal);
    for (const poly of f.geometry.coordinates)
      for (const anel of poly)
        for (const [x, y] of anel) {
          const k = `${Math.floor(x / g)},${Math.floor(y / g)}`;
          (grade.get(k) ?? grade.set(k, new Set()).get(k)!).add(nome);
        }
  }
  const viz: Record<string, Set<string>> = {};
  for (const [k, nomes] of grade) {
    const [cx, cy] = k.split(',').map(Number);
    const perto = new Set<string>(nomes);
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) grade.get(`${cx + dx},${cy + dy}`)?.forEach((n) => perto.add(n));
    for (const a of nomes) for (const b of perto) if (a !== b) (viz[a] ??= new Set()).add(b);
  }
  for (const f of ds) viz[normalizarBairro(f.properties.nm_distrito_municipal)] ??= new Set();
  return Object.fromEntries(Object.entries(viz).map(([k, v]) => [k, [...v].sort()]));
}

async function main() {
  const inicio = Date.now();
  const municipio = carregarMunicipio();
  const CAP = 6_500_000;
  const grp = new Int32Array(CAP);
  const lat = new Float64Array(CAP);
  const lng = new Float64Array(CAP);
  const num = new Int32Array(CAP);
  const nv = new Uint8Array(CAP);
  const loc = new Int32Array(CAP);
  const dist = new Int32Array(CAP);
  const grupos: { t: string; c: string; k: string }[] = [];
  const grupoDoTexto = new Map<string, number>();
  const idGrupo = new Map<string, number>();
  const localidades: string[] = [];
  const idLocalidade = new Map<string, number>();
  const codigos: string[] = [];
  const idCodigo = new Map<string, number>();
  const contagens: Record<string, number> = { linhas: 0, nv1: 0, nv2: 0, nv3: 0, nv4: 0, nv5: 0, nv6: 0, sem_coordenada: 0, sem_nome: 0, usadas: 0 };

  const rl = readline.createInterface({ input: abrirCsv(), crlfDelay: Infinity });
  let col: Record<string, number> | null = null;
  let n = 0;
  for await (const linha of rl) {
    if (!col) {
      col = Object.fromEntries(linha.split(';').map((h, i) => [h.trim(), i]));
      for (const c of ['NOM_TIPO_SEGLOGR', 'NOM_TITULO_SEGLOGR', 'NOM_SEGLOGR', 'NUM_ENDERECO', 'LATITUDE', 'LONGITUDE', 'NV_GEO_COORD', 'DSC_LOCALIDADE', 'COD_DISTRITO'])
        if (!(c in col)) throw new Error(`Coluna ${c} não está no CSV do CNEFE`);
      continue;
    }
    contagens.linhas++;
    if (contagens.linhas % 500_000 === 0) process.stdout.write(`  ${contagens.linhas} linhas (${Math.round((Date.now() - inicio) / 1000)} s)\r`);
    const f = linha.split(';');
    const nivel = Number(f[col.NV_GEO_COORD]);
    contagens[`nv${nivel}`] = (contagens[`nv${nivel}`] ?? 0) + 1;
    if (nivel < 1 || nivel > 4) continue;
    const la = Number(f[col.LATITUDE]);
    const ln = Number(f[col.LONGITUDE]);
    if (!la || !ln) {
      contagens.sem_coordenada++;
      continue;
    }
    const texto = `${f[col.NOM_TIPO_SEGLOGR]}|${f[col.NOM_TITULO_SEGLOGR]}|${f[col.NOM_SEGLOGR]}`;
    let g = grupoDoTexto.get(texto);
    if (g === undefined) {
      const nome = normalizarNome(tokens(`${f[col.NOM_TITULO_SEGLOGR]} ${f[col.NOM_SEGLOGR]}`));
      if (!nome.chave) g = -1;
      else {
        const t = normalizarTipo(f[col.NOM_TIPO_SEGLOGR]);
        const k = `${t}|${nome.completo}`;
        g = idGrupo.get(k);
        if (g === undefined) {
          g = grupos.length;
          grupos.push({ t, c: nome.completo, k: nome.chave });
          idGrupo.set(k, g);
        }
      }
      grupoDoTexto.set(texto, g);
    }
    if (g < 0) {
      contagens.sem_nome++;
      continue;
    }
    const lc = normalizarBairro(f[col.DSC_LOCALIDADE] ?? '');
    let li = idLocalidade.get(lc);
    if (li === undefined) (li = localidades.length), localidades.push(lc), idLocalidade.set(lc, li);
    const cd = f[col.COD_DISTRITO];
    let ci = idCodigo.get(cd);
    if (ci === undefined) (ci = codigos.length), codigos.push(cd), idCodigo.set(cd, ci);
    if (n >= CAP) throw new Error('Mais linhas que o previsto: aumente CAP');
    grp[n] = g;
    lat[n] = la;
    lng[n] = ln;
    num[n] = Number(f[col.NUM_ENDERECO]) || 0;
    nv[n] = nivel;
    loc[n] = li;
    dist[n] = ci;
    n++;
  }
  contagens.usadas = n;
  const segLeitura = Math.round((Date.now() - inicio) / 1000);
  console.log(`\n  ${contagens.linhas} linhas lidas em ${segLeitura} s; ${n} usadas; ${grupos.length} logradouros (tipo + nome)`);

  // Código do distrito do IBGE → distrito da GeoSampa (maioria dos pontos de uma amostra).
  const votos = codigos.map(() => new Map<string, number>());
  const amostrados = codigos.map(() => 0);
  for (let i = 0; i < n; i++) {
    if (amostrados[dist[i]] >= 400) continue;
    amostrados[dist[i]]++;
    const d = municipio.distritoDe(lat[i], lng[i]);
    if (d) votos[dist[i]].set(d, (votos[dist[i]].get(d) ?? 0) + 1);
  }
  const nomeDoCodigo = votos.map((v) => [...v].sort((a, b) => b[1] - a[1])[0]?.[0] ?? '');
  const conferencia = votos.map((v, i) => {
    const tot = [...v.values()].reduce((a, b) => a + b, 0);
    return { codigo: codigos[i], distrito: nomeDoCodigo[i], concordancia: tot ? (v.get(nomeDoCodigo[i]) ?? 0) / tot : 0 };
  });
  const distintos = new Set(nomeDoCodigo).size;
  console.log(`  Distritos do IBGE → GeoSampa: ${codigos.length} códigos, ${distintos} nomes; concordância mínima ${Math.min(...conferencia.map((c) => c.concordancia)).toFixed(3)}`);

  // Localidade → distrito (maioria ≥ 80%).
  const locDist = localidades.map(() => new Map<number, number>());
  for (let i = 0; i < n; i++) locDist[loc[i]].set(dist[i], (locDist[loc[i]].get(dist[i]) ?? 0) + 1);
  const localidadeDistrito: Record<string, string> = {};
  locDist.forEach((m, li) => {
    const tot = [...m.values()].reduce((a, b) => a + b, 0);
    const [melhor, q] = [...m].sort((a, b) => b[1] - a[1])[0] ?? [-1, 0];
    if (localidades[li] && tot >= 20 && q / tot >= 0.8) localidadeDistrito[localidades[li]] = nomeDoCodigo[melhor];
  });

  // Ordena os pontos por grupo (contagem).
  const inicioGrupo = new Int32Array(grupos.length + 1);
  for (let i = 0; i < n; i++) inicioGrupo[grp[i] + 1]++;
  for (let g = 0; g < grupos.length; g++) inicioGrupo[g + 1] += inicioGrupo[g];
  const pos = inicioGrupo.slice(0, grupos.length);
  const ordem = new Int32Array(n);
  for (let i = 0; i < n; i++) ordem[pos[grp[i]]++] = i;

  const instancias: Instancia[] = [];
  let enderecos = 0;
  let homonimos = 0;
  for (let g = 0; g < grupos.length; g++) {
    const idx = ordem.subarray(inicioGrupo[g], inicioGrupo[g + 1]);
    // Instâncias: componentes conexas das células de ~500 m ocupadas (8 vizinhas).
    const celulaDe = (i: number) => `${Math.floor(lat[i] / CELULA)},${Math.floor(lng[i] / CELULA)}`;
    const celulas = new Map<string, number[]>();
    for (const i of idx) {
      const k = celulaDe(i);
      (celulas.get(k) ?? celulas.set(k, []).get(k)!).push(i);
    }
    const comp = new Map<string, number>();
    let nComp = 0;
    for (const k0 of celulas.keys()) {
      if (comp.has(k0)) continue;
      const pilha = [k0];
      comp.set(k0, nComp);
      while (pilha.length) {
        const [a, b] = pilha.pop()!.split(',').map(Number);
        for (let da = -1; da <= 1; da++)
          for (let db = -1; db <= 1; db++) {
            const k = `${a + da},${b + db}`;
            if (celulas.has(k) && !comp.has(k)) (comp.set(k, nComp), pilha.push(k));
          }
      }
      nComp++;
    }
    if (nComp > 1) homonimos++;
    const porComp: number[][] = Array.from({ length: nComp }, () => []);
    for (const [k, is] of celulas) porComp[comp.get(k)!].push(...is);
    for (const pts of porComp) {
      const porNumero = new Map<number, number[]>();
      const ds = new Map<string, number>();
      const ls = new Set<string>();
      for (const i of pts) {
        if (nv[i] <= 3 && num[i] > 0) (porNumero.get(num[i]) ?? porNumero.set(num[i], []).get(num[i])!).push(i);
        const d = nomeDoCodigo[dist[i]];
        if (d) ds.set(d, (ds.get(d) ?? 0) + 1);
        if (localidades[loc[i]]) ls.add(localidades[loc[i]]);
      }
      const nums = [...porNumero.keys()].sort((a, b) => a - b);
      enderecos += nums.length;
      const la = pts.map((i) => lat[i]);
      const ln = pts.map((i) => lng[i]);
      instancias.push({
        ...grupos[g],
        d: [...ds].sort((a, b) => b[1] - a[1]).map(([d]) => d),
        l: [...ls].sort(),
        x: Math.round(extensaoM(la, ln)),
        m: [Math.round(mediana(la) * 1e6), Math.round(mediana(ln) * 1e6)],
        n: nums,
        la: nums.map((x) => Math.round(mediana(porNumero.get(x)!.map((i) => lat[i])) * 1e6)),
        ln: nums.map((x) => Math.round(mediana(porNumero.get(x)!.map((i) => lng[i])) * 1e6)),
      });
    }
  }
  const indice: IndiceCnefe = {
    versao: VERSAO_INDICE,
    fonte: { arquivo: path.basename(ZIP), bytes: fs.statSync(ZIP).size, linhas: contagens.linhas },
    contagens: { ...contagens, logradouros: grupos.length, instancias: instancias.length, nomes_com_homonimos: homonimos, enderecos_por_numero: enderecos, localidades_com_distrito: Object.keys(localidadeDistrito).length },
    localidades: localidadeDistrito,
    vizinhos: vizinhosDosDistritos(),
    instancias,
  };
  const destino = arquivoIndice();
  fs.writeFileSync(`${destino}.tmp`, zlib.gzipSync(JSON.stringify(indice)));
  fs.renameSync(`${destino}.tmp`, destino);
  const seg = Math.round((Date.now() - inicio) / 1000);
  console.log('\n================ ÍNDICE DO CNEFE ================');
  console.log(`NV_GEO_COORD: ${[1, 2, 3, 4, 5, 6].map((k) => `${k}: ${contagens[`nv${k}`] ?? 0}`).join(' | ')}`);
  console.log(`Linhas usadas (NV 1–4 com coordenada e nome): ${n} | sem nome: ${contagens.sem_nome} | sem coordenada: ${contagens.sem_coordenada}`);
  console.log(`Logradouros (tipo + nome): ${grupos.length} → ${instancias.length} instâncias (${homonimos} nomes com homônimos em lugares diferentes)`);
  console.log(`Endereços com número (NV 1–3, logradouro + número): ${enderecos}`);
  console.log(`Localidades com distrito: ${Object.keys(localidadeDistrito).length} | distritos com vizinhos: ${Object.keys(indice.vizinhos).length}`);
  console.log(`Tempo: ${seg} s (leitura ${segLeitura} s) | arquivo ${destino}: ${(fs.statSync(destino).size / 1e6).toFixed(1)} MB`);
}

main().catch((err) => {
  console.error(process.env.DEBUG && err instanceof Error ? err.stack : err instanceof Error ? err.message : err);
  process.exit(1);
});
