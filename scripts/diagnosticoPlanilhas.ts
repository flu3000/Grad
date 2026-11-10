/**
 * Diagnóstico das planilhas da SSP-SP (somente leitura): estrutura, legenda, aliases de colunas, datas, horário,
 * localização, BOs com várias linhas e categorias. Um processo por arquivo, em paralelo.
 *
 *   npm run data:diagnostico                       → todas as .xlsx de data/SSP-SP (e subpastas)
 *   Opções: --arquivos=a.xlsx,b.xlsx  --workers=N  --limite=N (só as N primeiras linhas de cada aba, para testar)
 *
 * Saída: scripts/out/diagnostico_planilhas.json + resumo no terminal. Nada é gravado no Supabase e nenhum
 * endereço sai do computador.
 */
import { fork } from 'child_process';
import crypto from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';
import ExcelJS from 'exceljs';
import { classifyCrime, normalizeText, type CrimeCategory } from './src/config/crimeWeights';
import { ehCabecalhoDeDados, mapearCabecalho, type Cabecalho, type Coluna } from './src/lib/colunas';
import { periodoDaHora, periodoDoTexto } from './src/lib/horario';
import { carregarMunicipio } from './src/lib/municipio';
import { arg, dataDir, outDir } from './src/lib/paths';
import { anoDaPlanilha, listarPlanilhas } from './src/lib/planilhas';
import { normalizarBairro } from './src/lib/semLocalizacao';
import {
  codigoIbge,
  coordenada,
  data,
  ehNomeDaCapital,
  ehSigilo,
  hora,
  IBGE_CAPITAL,
  numeroLogradouro,
  texto,
  valorBruto,
} from './src/lib/valores';

type Cont = Record<string, number>;
const inc = (o: Cont, k: string, n = 1) => {
  o[k] = (o[k] ?? 0) + n;
};
const top = (o: Cont | Map<string, number>, n: number): [string, number][] =>
  [...(o instanceof Map ? o : Object.entries(o))].sort((a, b) => b[1] - a[1]).slice(0, n);
const pct = (a: number, b: number) => (b ? `${((100 * a) / b).toFixed(1)}%` : '-');
const cacheDir = path.join(outDir, 'cache', 'diagnostico');

/** Categorias que a SSP oculta de propósito: não entram na contagem do que dá para geocodificar. */
const SENSIVEL = /ESTUPRO|VIOLACAO SEXUAL|IMPORTUNACAO SEXUAL|ASSEDIO SEXUAL|SEXUAL|VIOLENCIA DOMESTICA|MARIA DA PENHA|11\.340|CRIANCA|ADOLESCENTE|VULNERAVEL|ECA\b/;

interface ContLocal {
  total: number;
  sigilo: number;
  sensivel: number;
  comEnderecoENumero: number;
  soLogradouro: number;
  semEndereco: number;
}
const novoContLocal = (): ContLocal => ({ total: 0, sigilo: 0, sensivel: 0, comEnderecoENumero: 0, soLogradouro: 0, semEndereco: 0 });

interface Detalhe {
  logradouro: Cont;
  bairro: Cont;
  precisao: Cont;
  categoria: Cont;
}
/** Conta no máximo 15 valores distintos; o resto vai para "(outros)". */
function incLimitado(o: Cont, k: string) {
  if (k in o || Object.keys(o).length < 15) inc(o, k);
  else inc(o, '(outros)');
}

interface Aba {
  indice: number;
  nome: string;
  tipo: 'dados' | 'legenda' | 'outra';
  linhaCabecalho: number | null;
  colunas: string[];
  colunasMapeadas: Partial<Record<Coluna, string>>;
  faltando: Coluna[];
  desconhecidas: string[];
  linhas: number;
  registro: { min: string | null; max: string | null; porMes: Cont };
  ocorrenciaPorMes: Cont;
}

interface ResultadoArquivo {
  arquivo: string;
  ano: number | null;
  tamanhoMB: number;
  segundos: number;
  abas: Aba[];
  legenda: string[][] | null;
  linhas: number;
  formatos: Record<'data_registro' | 'data_ocorrencia' | 'hora' | 'lat' | 'lng' | 'cod_ibge' | 'numero', Cont>;
  municipio: Cont;
  capital: {
    linhas: number;
    porCategoria: Cont;
    outrosTop30: [string, number][];
    horario: { total: Cont; porCategoria: Record<string, Cont>; delegaciaEletronica: Cont; outrasDelegacias: Cont };
    descPeriodo: Cont;
    horaXPeriodo: Record<string, Cont>;
    histHora: number[];
    histMinuto: number[];
    comSegundos: number;
    meiaNoite: Cont;
    conflitos: { comparaveis: number; conflito: number; porPeriodoTexto: Record<string, Cont> };
    localizacao: {
      comCoordenada: number;
      semCoordenada: ContLocal;
      semCoordenadaPorCategoria: Record<string, ContLocal>;
      textosDeSigilo: [string, number][];
      sigiloComCoordenada: number;
      precisao: Cont;
      coordenadasRepetidas_top30: { coordenada: string; bos: number; detalhe: Detalhe | null }[];
      coordenadasDistintas: number;
      casasDecimais: Record<string, { bos: number; bairroEhDistrito: number; distritoDiferente: number }>;
    };
    bos: {
      comChave: boolean;
      linhasComChave: number;
      unicos: number;
      linhasPorBo: Cont;
      combinacoes_top30: [string, number][];
      mesmaCategoriaRepetida: number;
      emMaisDeUmaAba: number;
    };
    estatistica: Cont;
    anoBoDiferenteDoRegistro: number;
    ocorrenciaPorAno: Cont;
    bairrosTop30: [string, number][];
    tipoLocalTop20: [string, number][];
  };
}

// ------------------------------------------------------------------------------------------------------------
// Processo filho: lê UM arquivo inteiro.
// ------------------------------------------------------------------------------------------------------------
async function diagnosticarArquivo(caminho: string, limite: number): Promise<ResultadoArquivo> {
  const inicio = Date.now();
  const municipio = carregarMunicipio();
  const r: ResultadoArquivo = {
    arquivo: path.basename(caminho),
    ano: anoDaPlanilha(caminho),
    tamanhoMB: Math.round(fs.statSync(caminho).size / 2 ** 20),
    segundos: 0,
    abas: [],
    legenda: null,
    linhas: 0,
    formatos: { data_registro: {}, data_ocorrencia: {}, hora: {}, lat: {}, lng: {}, cod_ibge: {}, numero: {} },
    municipio: {},
    capital: {
      linhas: 0,
      porCategoria: {},
      outrosTop30: [],
      horario: { total: {}, porCategoria: {}, delegaciaEletronica: {}, outrasDelegacias: {} },
      descPeriodo: {},
      horaXPeriodo: {},
      histHora: Array(24).fill(0),
      histMinuto: Array(60).fill(0),
      comSegundos: 0,
      meiaNoite: {},
      conflitos: { comparaveis: 0, conflito: 0, porPeriodoTexto: {} },
      localizacao: {
        comCoordenada: 0,
        semCoordenada: novoContLocal(),
        semCoordenadaPorCategoria: {},
        textosDeSigilo: [],
        sigiloComCoordenada: 0,
        precisao: {},
        coordenadasRepetidas_top30: [],
        coordenadasDistintas: 0,
        casasDecimais: {},
      },
      bos: { comChave: false, linhasComChave: 0, unicos: 0, linhasPorBo: {}, combinacoes_top30: [], mesmaCategoriaRepetida: 0, emMaisDeUmaAba: 0 },
      estatistica: {},
      anoBoDiferenteDoRegistro: 0,
      ocorrenciaPorAno: {},
      bairrosTop30: [],
      tipoLocalTop20: [],
    },
  };
  const cap = r.capital;
  const outros = new Map<string, number>();
  const sigiloTextos = new Map<string, number>();
  const bairros = new Map<string, number>();
  const tiposLocal = new Map<string, number>();
  const coords = new Map<string, number>();
  const detalhes = new Map<string, Detalhe>();
  const bos = new Map<string, { n: number; cats: CrimeCategory[]; abas: number }>();

  const reader = new ExcelJS.stream.xlsx.WorkbookReader(caminho, {
    sharedStrings: 'cache',
    worksheets: 'emit',
    hyperlinks: 'ignore',
    styles: 'ignore',
    entries: 'ignore',
  });

  let indiceAba = 0;
  for await (const ws of reader) {
    indiceAba++;
    const nome = (ws as unknown as { name?: string }).name ?? `aba ${indiceAba}`;
    const aba: Aba = {
      indice: indiceAba,
      nome,
      tipo: 'outra',
      linhaCabecalho: null,
      colunas: [],
      colunasMapeadas: {},
      faltando: [],
      desconhecidas: [],
      linhas: 0,
      registro: { min: null, max: null, porMes: {} },
      ocorrenciaPorMes: {},
    };
    r.abas.push(aba);
    let cab: Cabecalho | null = null;
    const primeiras: string[][] = [];
    let linhasLidas = 0;

    for await (const row of ws) {
      linhasLidas++;
      const values = row.values as unknown[];
      if (!cab) {
        const c = mapearCabecalho(values);
        if (ehCabecalhoDeDados(c)) {
          cab = c;
          aba.tipo = 'dados';
          aba.linhaCabecalho = row.number;
          aba.colunas = c.originais;
          aba.faltando = c.faltando;
          aba.desconhecidas = c.desconhecidas;
          for (const [col, i] of Object.entries(c.indice)) aba.colunasMapeadas[col as Coluna] = String(values[i as number]).trim();
        } else if (primeiras.length < 300) {
          primeiras.push(values.slice(1).map((v) => texto(v) ?? ''));
        }
        if (!cab && linhasLidas > 50 && primeiras.length >= 300) break; // aba grande sem cabeçalho de dados
        continue;
      }
      if (limite && aba.linhas >= limite) break;
      const col = cab.indice;
      const v = (c: Coluna) => (col[c] !== undefined ? values[col[c]!] : undefined);
      r.linhas++;
      aba.linhas++;
      if (r.linhas % 50_000 === 0) process.send?.({ tipo: 'progresso', linhas: r.linhas });

      // Datas
      const dr = data(v('data_registro'));
      const dOc = data(v('data_ocorrencia'));
      inc(r.formatos.data_registro, dr.formato);
      inc(r.formatos.data_ocorrencia, dOc.formato);
      if (dr.valor) {
        if (!aba.registro.min || dr.valor < aba.registro.min) aba.registro.min = dr.valor;
        if (!aba.registro.max || dr.valor > aba.registro.max) aba.registro.max = dr.valor;
        inc(aba.registro.porMes, dr.valor.slice(0, 7));
      }
      inc(aba.ocorrenciaPorMes, dOc.valor ? dOc.valor.slice(0, 7) : '?');

      // Localização e município
      const lat = coordenada(v('lat'));
      const lng = coordenada(v('lng'));
      inc(r.formatos.lat, lat.formato);
      inc(r.formatos.lng, lng.formato);
      const temCoord = lat.valor !== null && lng.valor !== null;
      const ibgeBruto = v('cod_ibge');
      const ibge = col.cod_ibge !== undefined ? codigoIbge(ibgeBruto) : null;
      inc(r.formatos.cod_ibge, col.cod_ibge === undefined ? 'sem_coluna' : ibge === null ? 'nulo' : 'numero');
      // Sem COD IBGE (planilha antiga): o município do fato é o da delegacia de circunscrição.
      const porCodigo =
        col.cod_ibge !== undefined ? ibge === IBGE_CAPITAL : ehNomeDaCapital(texto(v('municipio_circunscricao')) ?? texto(v('municipio')));
      const foraDoEstado = temCoord && (lat.valor! < -25.5 || lat.valor! > -19.5 || lng.valor! < -53.5 || lng.valor! > -44);
      const distrito = temCoord && !foraDoEstado ? municipio.distritoDe(lat.valor!, lng.valor!) : null;
      if (foraDoEstado) inc(r.municipio, 'coordenada_fora_do_estado');
      inc(
        r.municipio,
        `${porCodigo ? 'codigo_capital' : col.cod_ibge !== undefined && ibge === null ? 'codigo_nulo' : 'codigo_outro'}__${!temCoord ? 'sem_coordenada' : distrito ? 'dentro_dos_distritos' : 'fora_dos_distritos'}`,
      );
      if (!porCodigo && !distrito) continue;

      // ---- daqui em diante: só a capital (código IBGE da capital OU coordenada dentro dos 96 distritos) ----
      cap.linhas++;
      const rubrica = texto(v('rubrica')) ?? '';
      const natureza = texto(v('natureza')) ?? '';
      const categoria = classifyCrime(rubrica, natureza);
      inc(cap.porCategoria, categoria);
      if (categoria === 'outros') {
        const k = normalizeText(`${rubrica} | ${natureza}`);
        outros.set(k, (outros.get(k) ?? 0) + 1);
      }
      if (dOc.valor) inc(cap.ocorrenciaPorAno, dOc.valor.slice(0, 4));
      else inc(cap.ocorrenciaPorAno, '?');

      // Horário
      const h = hora(v('hora'));
      inc(r.formatos.hora, h.formato);
      const descBruto = texto(v('periodo'));
      inc(cap.descPeriodo, descBruto ?? '(nulo)');
      const pTexto = periodoDoTexto(descBruto);
      const classe = h.valor ? 'hora_exata' : pTexto && pTexto !== 'incerta' ? 'so_periodo' : 'nenhum';
      inc(cap.horario.total, classe);
      inc((cap.horario.porCategoria[categoria] ??= {}), classe);
      const delegacia = normalizeText(texto(v('delegacia')) ?? '');
      inc(delegacia.includes('ELETRONICA') ? cap.horario.delegaciaEletronica : cap.horario.outrasDelegacias, classe);
      if (h.valor) {
        const { h: hh, m: mm, s: ss } = h.valor;
        cap.histHora[hh]++;
        cap.histMinuto[mm]++;
        if (ss) cap.comSegundos++;
        inc((cap.horaXPeriodo[String(hh).padStart(2, '0')] ??= {}), pTexto ?? '(nulo)');
        if (hh === 0 && mm === 0 && ss === 0) inc(cap.meiaNoite, pTexto ?? '(nulo)');
        if (pTexto && pTexto !== 'incerta') {
          cap.conflitos.comparaveis++;
          const calc = periodoDaHora(hh);
          if (calc !== pTexto) cap.conflitos.conflito++;
          inc((cap.conflitos.porPeriodoTexto[pTexto] ??= {}), calc);
        }
      }

      // Endereço e coordenada
      const logradouro = texto(v('logradouro'));
      const numero = numeroLogradouro(v('numero'));
      inc(r.formatos.numero, numero ? 'com_numero' : texto(v('numero')) === null ? 'nulo' : 'zero_ou_texto');
      const sigilo = ehSigilo(logradouro);
      const bairro = texto(v('bairro'));
      if (bairro) bairros.set(bairro, (bairros.get(bairro) ?? 0) + 1);
      const tipoLocal = texto(v('tipo_local')) ?? texto(v('subtipo_local'));
      if (tipoLocal) tiposLocal.set(tipoLocal, (tiposLocal.get(tipoLocal) ?? 0) + 1);
      if (temCoord) {
        cap.localizacao.comCoordenada++;
        if (sigilo) cap.localizacao.sigiloComCoordenada++;
        // Casas decimais (a menor entre lat e lng): 4 casas ≈ 11 m de grade; pontos arredondados indicam outra origem.
        const casas = Math.min(...[lat.valor!, lng.valor!].map((x) => String(x).split('.')[1]?.length ?? 0));
        const q = (cap.localizacao.casasDecimais[casas >= 6 ? '6+' : String(casas)] ??= { bos: 0, bairroEhDistrito: 0, distritoDiferente: 0 });
        q.bos++;
        const bairroDistrito = bairro ? normalizarBairro(bairro) : null;
        if (bairroDistrito && municipio.nomes.has(bairroDistrito)) {
          q.bairroEhDistrito++;
          if (distrito && distrito !== bairroDistrito) q.distritoDiferente++;
        }
        const prec = col.precisao !== undefined ? (texto(v('precisao')) ?? '(nulo)') : '(sem coluna)';
        inc(cap.localizacao.precisao, prec);
        const k = `${lat.valor!.toFixed(6)},${lng.valor!.toFixed(6)}`;
        const n = (coords.get(k) ?? 0) + 1;
        coords.set(k, n);
        // Detalhes só para pontos que se repetem (≥ 20 BOs), para caber na memória.
        if (n >= 20) {
          let d = detalhes.get(k);
          if (!d) detalhes.set(k, (d = { logradouro: {}, bairro: {}, precisao: {}, categoria: {} }));
          incLimitado(d.logradouro, normalizeText(logradouro ?? '(nulo)'));
          incLimitado(d.bairro, normalizarBairro(bairro ?? '(nulo)'));
          incLimitado(d.precisao, prec);
          incLimitado(d.categoria, categoria);
        }
      } else {
        const sensivel = SENSIVEL.test(normalizeText(`${rubrica} | ${natureza}`));
        const contar = (c: ContLocal) => {
          c.total++;
          if (sigilo) c.sigilo++;
          else if (sensivel) c.sensivel++;
          else if (logradouro && normalizeText(logradouro).length >= 4 && numero) c.comEnderecoENumero++;
          else if (logradouro && normalizeText(logradouro).length >= 4) c.soLogradouro++;
          else c.semEndereco++;
        };
        contar(cap.localizacao.semCoordenada);
        contar((cap.localizacao.semCoordenadaPorCategoria[categoria] ??= novoContLocal()));
        if (sigilo || lat.formato === 'zero') {
          const t = `${normalizeText(logradouro ?? '(nulo)')} [lat ${lat.formato}]`;
          sigiloTextos.set(t, (sigiloTextos.get(t) ?? 0) + 1);
        }
      }

      // BO (NUM_BO + ANO_BO + NOME_DELEGACIA)
      const num = texto(v('num_bo'));
      if (num) {
        cap.bos.comChave = true;
        cap.bos.linhasComChave++;
        const chave = `${num}|${texto(v('ano_bo')) ?? ''}|${texto(v('delegacia')) ?? ''}`;
        const b = bos.get(chave);
        if (b) {
          b.n++;
          if (b.cats.includes(categoria)) cap.bos.mesmaCategoriaRepetida++;
          else b.cats.push(categoria);
          b.abas |= 1 << indiceAba;
        } else bos.set(chave, { n: 1, cats: [categoria], abas: 1 << indiceAba });
        const anoBo = Number(texto(v('ano_bo')));
        if (dr.valor && anoBo && anoBo !== Number(dr.valor.slice(0, 4))) cap.anoBoDiferenteDoRegistro++;
      }

      // Mês/ano da estatística oficial × data de registro
      const mesEst = Number(valorBruto(v('mes_estatistica')));
      const anoEst = Number(valorBruto(v('ano_estatistica')));
      if (col.mes_estatistica !== undefined && dr.valor) {
        if (!mesEst || !anoEst) inc(cap.estatistica, 'sem_valor');
        else if (anoEst === +dr.valor.slice(0, 4) && mesEst === +dr.valor.slice(5, 7)) inc(cap.estatistica, 'igual_ao_registro');
        else inc(cap.estatistica, `diferente (registro ${dr.valor.slice(0, 7)} → estatística ${anoEst}-${String(mesEst).padStart(2, '0')})`);
      }
    }
    if (!cab && primeiras.some((l) => l.some((c) => /^CAMPOS?$/i.test(c.trim())) || /CAMPOS/i.test(nome))) {
      aba.tipo = 'legenda';
      r.legenda = primeiras.filter((l) => l.some(Boolean));
    }
  }

  // Resumos
  cap.outrosTop30 = top(outros, 30);
  cap.localizacao.textosDeSigilo = top(sigiloTextos, 15);
  cap.localizacao.coordenadasDistintas = coords.size;
  cap.localizacao.coordenadasRepetidas_top30 = top(coords, 30).map(([k, n]) => ({ coordenada: k, bos: n, detalhe: detalhes.get(k) ?? null }));
  cap.bairrosTop30 = top(bairros, 30);
  cap.tipoLocalTop20 = top(tiposLocal, 20);
  const combinacoes = new Map<string, number>();
  const chaves: string[] = [];
  for (const [chave, b] of bos) {
    cap.bos.unicos++;
    inc(cap.bos.linhasPorBo, b.n >= 5 ? '5+' : String(b.n));
    if (b.n > 1) {
      const k = [...b.cats].sort().join(' + ');
      combinacoes.set(k, (combinacoes.get(k) ?? 0) + 1);
    }
    if (b.abas & (b.abas - 1)) cap.bos.emMaisDeUmaAba++;
    chaves.push(crypto.createHash('sha1').update(chave).digest('hex').slice(0, 16));
  }
  cap.bos.combinacoes_top30 = top(combinacoes, 30);
  // Chaves (hash) dos BOs da capital, para o processo principal achar BOs repetidos entre arquivos.
  fs.mkdirSync(cacheDir, { recursive: true });
  fs.writeFileSync(path.join(cacheDir, `${r.arquivo}.bos.txt`), chaves.join('\n'));
  r.segundos = Math.round((Date.now() - inicio) / 1000);
  return r;
}

// ------------------------------------------------------------------------------------------------------------
// Processo principal: dispara um filho por arquivo, junta e resume.
// ------------------------------------------------------------------------------------------------------------
function rodarFilho(caminho: string, limite: number, progresso: Map<string, number>): Promise<ResultadoArquivo> {
  return new Promise((resolve, reject) => {
    const saida = path.join(cacheDir, `${path.basename(caminho)}.json`);
    const filho = fork(__filename, [`--um-arquivo=${caminho}`, `--saida=${saida}`, `--limite=${limite}`], {
      execArgv: [...process.execArgv, '--max-old-space-size=3072'],
    });
    filho.on('message', (m: { tipo: string; linhas: number }) => m.tipo === 'progresso' && progresso.set(path.basename(caminho), m.linhas));
    filho.on('exit', (code) =>
      code === 0 ? resolve(JSON.parse(fs.readFileSync(saida, 'utf-8'))) : reject(new Error(`Falhou ao ler ${caminho} (código ${code})`)),
    );
  });
}

async function principal() {
  const limite = Number(arg('limite') ?? 0);
  const lista = arg('arquivos')
    ?.split(',')
    .map((c) => ({ caminho: path.resolve(c), ano: anoDaPlanilha(c) })) ?? listarPlanilhas(path.join(dataDir(), 'SSP-SP'));
  if (!lista.length) throw new Error(`Nenhuma .xlsx em ${path.join(dataDir(), 'SSP-SP')}`);
  const workers = Math.max(1, Math.min(Number(arg('workers') ?? os.cpus().length - 1), lista.length, 4));
  console.log(`Planilhas (${lista.length}), ${workers} em paralelo${limite ? `, só ${limite} linhas por aba` : ''}:`);
  for (const p of lista) console.log(`  ${p.ano ?? '????'}  ${path.relative(process.cwd(), p.caminho)}`);
  fs.mkdirSync(cacheDir, { recursive: true });

  const progresso = new Map<string, number>();
  const inicio = Date.now();
  const timer = setInterval(() => {
    const s = (Date.now() - inicio) / 1000;
    const total = [...progresso.values()].reduce((a, b) => a + b, 0);
    process.stdout.write(`  ${[...progresso].map(([f, n]) => `${f.replace(/\.xlsx$/, '')}: ${(n / 1000).toFixed(0)} mil`).join(' | ')} | ${Math.round(total / s)} linhas/s   \r`);
  }, 3000);
  const resultados: ResultadoArquivo[] = [];
  const fila = [...lista];
  await Promise.all(
    Array.from({ length: workers }, async () => {
      for (let p = fila.shift(); p; p = fila.shift()) {
        const res = await rodarFilho(p.caminho, limite, progresso);
        resultados.push(res);
        console.log(`\n  ✓ ${res.arquivo}: ${res.linhas} linhas em ${res.segundos} s`);
      }
    }),
  );
  clearInterval(timer);
  resultados.sort((a, b) => (a.ano ?? 0) - (b.ano ?? 0));

  // BOs da capital que aparecem em mais de um arquivo.
  const vistos = new Map<string, number>();
  for (const res of resultados)
    for (const k of fs.readFileSync(path.join(cacheDir, `${res.arquivo}.bos.txt`), 'utf-8').split('\n'))
      if (k) vistos.set(k, (vistos.get(k) ?? 0) + 1);
  const entreArquivos = [...vistos.values()].filter((n) => n > 1).length;

  // Sobreposição de datas de registro entre arquivos.
  const intervalos = resultados.map((res) => {
    const dados = res.abas.filter((a) => a.tipo === 'dados');
    return {
      arquivo: res.arquivo,
      min: dados.map((a) => a.registro.min).filter(Boolean).sort()[0] ?? null,
      max: dados.map((a) => a.registro.max).filter(Boolean).sort().at(-1) ?? null,
    };
  });
  const sobreposicoes = intervalos.flatMap((a, i) =>
    intervalos.slice(i + 1).filter((b) => a.min && b.min && a.max! >= b.min! && b.max! >= a.min!).map((b) => `${a.arquivo} × ${b.arquivo}`),
  );

  // Aliases efetivamente usados (nome original → coluna), por arquivo.
  const aliases: Record<string, Record<string, string>> = {};
  for (const res of resultados)
    for (const a of res.abas.filter((x) => x.tipo === 'dados'))
      for (const [c, original] of Object.entries(a.colunasMapeadas)) (aliases[c] ??= {})[res.arquivo] = original!;

  const relatorio = { geradoEm: new Date().toISOString(), entreArquivos_bosRepetidos: entreArquivos, intervalosDeRegistro: intervalos, sobreposicoes, aliases, arquivos: resultados };
  fs.mkdirSync(outDir, { recursive: true });
  const arquivoSaida = path.join(outDir, 'diagnostico_planilhas.json');
  fs.writeFileSync(arquivoSaida, JSON.stringify(relatorio, null, 2));
  imprimirResumo(relatorio);
  console.log(`\nRelatório completo: ${arquivoSaida}`);
}

function imprimirResumo(rel: {
  entreArquivos_bosRepetidos: number;
  intervalosDeRegistro: { arquivo: string; min: string | null; max: string | null }[];
  sobreposicoes: string[];
  arquivos: ResultadoArquivo[];
}) {
  const L = console.log;
  L('\n================ ESTRUTURA ================');
  for (const res of rel.arquivos) {
    L(`\n${res.arquivo} (ano ${res.ano}, ${res.tamanhoMB} MB, ${res.linhas} linhas, ${res.segundos} s)`);
    for (const a of res.abas)
      L(
        `  aba ${a.indice} "${a.nome}": ${a.tipo}` +
          (a.tipo === 'dados'
            ? ` | cabeçalho na linha ${a.linhaCabecalho} | ${a.linhas} linhas | registro ${a.registro.min} a ${a.registro.max}`
            : ''),
      );
    const dados = res.abas.filter((a) => a.tipo === 'dados');
    if (dados[0]) {
      L(`  faltam: ${dados[0].faltando.join(', ') || '-'}`);
      if (dados[0].desconhecidas.length) L(`  colunas sem alias: ${dados[0].desconhecidas.join(', ')}`);
    }
    L(`  formatos: ${Object.entries(res.formatos).map(([k, f]) => `${k} ${JSON.stringify(f)}`).join(' | ')}`);
  }
  L(`\nRegistro por arquivo: ${rel.intervalosDeRegistro.map((i) => `${i.arquivo} ${i.min}..${i.max}`).join(' | ')}`);
  L(`Sobreposição de datas de registro: ${rel.sobreposicoes.join('; ') || 'nenhuma'}`);
  L(`BOs da capital repetidos entre arquivos: ${rel.entreArquivos_bosRepetidos}`);

  L('\n================ CAPITAL ================');
  for (const res of rel.arquivos) {
    const c = res.capital;
    L(`\n--- ${res.arquivo}: ${c.linhas} linhas da capital`);
    L(`  município (código × polígono): ${JSON.stringify(res.municipio)}`);
    L(`  ano da ocorrência: ${JSON.stringify(c.ocorrenciaPorAno)}`);
    const ht = c.horario.total;
    const tot = (ht.hora_exata ?? 0) + (ht.so_periodo ?? 0) + (ht.nenhum ?? 0);
    L(`  horário: hora exata ${pct(ht.hora_exata ?? 0, tot)} | só período ${pct(ht.so_periodo ?? 0, tot)} | nenhum ${pct(ht.nenhum ?? 0, tot)}`);
    L(`    delegacia eletrônica ${JSON.stringify(c.horario.delegaciaEletronica)} | outras ${JSON.stringify(c.horario.outrasDelegacias)}`);
    L(`  DESC_PERIODO: ${JSON.stringify(c.descPeriodo)}`);
    L(`  conflito hora × DESC_PERIODO: ${c.conflitos.conflito}/${c.conflitos.comparaveis} (${pct(c.conflitos.conflito, c.conflitos.comparaveis)})`);
    L(`  hora (0..23): ${c.histHora.join(' ')}`);
    L(`  minuto 00: ${c.histMinuto[0]} | 30: ${c.histMinuto[30]} | média dos outros: ${Math.round(c.histMinuto.reduce((a, b, i) => (i % 30 ? a + b : a), 0) / 58)} | com segundos: ${c.comSegundos}`);
    L(`  00:00:00 por DESC_PERIODO: ${JSON.stringify(c.meiaNoite)}`);
    const sc = c.localizacao.semCoordenada;
    L(
      `  coordenada: com ${c.localizacao.comCoordenada} | sem ${sc.total} (sigilo ${sc.sigilo}, sensível ${sc.sensivel}, ` +
        `endereço+número ${sc.comEnderecoENumero}, só logradouro ${sc.soLogradouro}, sem endereço ${sc.semEndereco})`,
    );
    L(`  PRECISAO: ${JSON.stringify(c.localizacao.precisao)}`);
    L(`  casas decimais (BOs | bairro = distrito | ponto em outro distrito): ${Object.entries(c.localizacao.casasDecimais).sort().map(([k, x]) => `${k}: ${x.bos} | ${x.bairroEhDistrito} | ${x.distritoDiferente} (${pct(x.distritoDiferente, x.bairroEhDistrito)})`).join(" ; ")}`);
    L(`  coordenadas distintas: ${c.localizacao.coordenadasDistintas}; mais repetidas:`);
    for (const x of c.localizacao.coordenadasRepetidas_top30.slice(0, 10))
      L(`    ${x.coordenada} ${x.bos} BOs | ${x.detalhe ? `${top(x.detalhe.bairro, 1)[0]?.[0]} / ${top(x.detalhe.logradouro, 1)[0]?.[0]} / ${top(x.detalhe.precisao, 1)[0]?.[0]}` : ''}`);
    if (c.bos.comChave)
      L(
        `  BOs: ${c.bos.unicos} únicos em ${c.bos.linhasComChave} linhas | linhas por BO ${JSON.stringify(c.bos.linhasPorBo)} | ` +
          `mesma categoria repetida ${c.bos.mesmaCategoriaRepetida} | em mais de uma aba ${c.bos.emMaisDeUmaAba}`,
      );
    for (const [k, n] of c.bos.combinacoes_top30.slice(0, 8)) L(`    ${n}  ${k}`);
    L(`  por categoria: ${JSON.stringify(c.porCategoria)}`);
    L(`  "outros" (top 10): ${c.outrosTop30.slice(0, 10).map(([k, n]) => `${k} (${n})`).join('; ')}`);
  }
}

if (arg('um-arquivo')) {
  diagnosticarArquivo(arg('um-arquivo')!, Number(arg('limite') ?? 0))
    .then((res) => {
      fs.writeFileSync(arg('saida')!, JSON.stringify(res));
      process.exit(0);
    })
    .catch((err) => {
      console.error(err instanceof Error ? err.stack : err);
      process.exit(1);
    });
} else {
  principal().catch((err) => {
    console.error(process.env.DEBUG && err instanceof Error ? err.stack : err instanceof Error ? err.message : err);
    process.exit(1);
  });
}

