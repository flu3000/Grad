/**
 * Estágio A — limpeza e extração. Lê cada .xlsx da SSP-SP (streaming), mantém só as colunas e as linhas da capital
 * e grava partes de 100.000 linhas em data/SSP-SP/limpo/<ano>/<arquivo>__<aba>__parte_0001.csv.gz.
 * As planilhas originais nunca são alteradas. Um manifesto guarda a impressão digital de cada arquivo para pular
 * o que já foi extraído. Arquivos diferentes são lidos em paralelo (um processo por arquivo).
 */
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import ExcelJS from 'exceljs';
import { COLUNAS, ehCabecalhoDeDados, mapearCabecalho, type Cabecalho, type Coluna } from '../lib/colunas';
import { cabecalhoCsv, COLUNAS_DESCARTADAS, limparLinha, linhaCsv } from '../lib/limpeza';
import { carregarMunicipio } from '../lib/municipio';
import { dataDir } from '../lib/paths';
import { listarPlanilhas, type Planilha } from '../lib/planilhas';
import { avisarProgresso, ehTrabalhador, rodarEmPool, servirTarefas, workersPadrao } from '../lib/pool';

/** Mude quando a limpeza mudar: força nova extração de todos os arquivos. */
export const VERSAO_LIMPEZA = 1;
export const LINHAS_POR_PARTE = 100_000;

export const pastaSsp = () => path.join(dataDir(), 'SSP-SP');
export const pastaLimpo = () => path.join(pastaSsp(), 'limpo');
export const arquivoManifesto = () => path.join(pastaLimpo(), 'manifesto.json');

export interface Parte {
  /** Caminho relativo a data/SSP-SP/limpo (com "/"). */
  arquivo: string;
  origem: string;
  ano: number | null;
  aba: string;
  linhas: number;
  primeiraLinha: number;
  ultimaLinha: number;
  bytes: number;
}

export interface ResumoArquivo {
  origem: string;
  ano: number | null;
  impressao: string;
  versao: number;
  bytesOrigem: number;
  bytesLimpo: number;
  segundos: number;
  abas: { nome: string; tipo: 'dados' | 'ignorada'; lidas: number; mantidas: number }[];
  lidas: number;
  mantidas: number;
  descartadas: Record<string, number>;
  divergencias: Record<string, number>;
  colunasEncontradas: Coluna[];
  colunasDescartadas: Coluna[];
  colunasFaltando: Coluna[];
  partes: Parte[];
}

export interface Manifesto {
  versao: number;
  linhasPorParte: number;
  arquivos: Record<string, ResumoArquivo>;
}

/** Tamanho + data de modificação + SHA-1 do primeiro 1 MB. */
export function impressaoDigital(caminho: string): string {
  const st = fs.statSync(caminho);
  const fd = fs.openSync(caminho, 'r');
  const buf = Buffer.alloc(Math.min(2 ** 20, st.size));
  fs.readSync(fd, buf, 0, buf.length, 0);
  fs.closeSync(fd);
  return `${st.size}-${Math.round(st.mtimeMs)}-${crypto.createHash('sha1').update(buf).digest('hex').slice(0, 12)}`;
}

export function lerManifesto(): Manifesto {
  const f = arquivoManifesto();
  if (!fs.existsSync(f)) return { versao: VERSAO_LIMPEZA, linhasPorParte: LINHAS_POR_PARTE, arquivos: {} };
  return JSON.parse(fs.readFileSync(f, 'utf-8'));
}

function salvarManifesto(m: Manifesto) {
  fs.mkdirSync(pastaLimpo(), { recursive: true });
  const tmp = `${arquivoManifesto()}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(m, null, 2));
  fs.renameSync(tmp, arquivoManifesto());
}

const chaveDoArquivo = (caminho: string) => path.relative(pastaSsp(), caminho).split(path.sep).join('/');
const seguro = (s: string) => s.replace(/[^A-Za-z0-9_-]+/g, '_').replace(/^_|_$/g, '');

/** Já extraído com a mesma impressão, a mesma versão e todas as partes no disco? */
export function jaExtraido(m: Manifesto, caminho: string): boolean {
  const r = m.arquivos[chaveDoArquivo(caminho)];
  return (
    !!r &&
    r.versao === VERSAO_LIMPEZA &&
    r.impressao === impressaoDigital(caminho) &&
    r.partes.every((p) => fs.existsSync(path.join(pastaLimpo(), p.arquivo)))
  );
}

class EscritorDeParte {
  private gz: zlib.Gzip;
  private destino: fs.WriteStream;
  private pendente: string[] = [];
  linhas = 0;
  primeira = 0;
  ultima = 0;
  constructor(readonly final: string) {
    fs.mkdirSync(path.dirname(final), { recursive: true });
    this.gz = zlib.createGzip({ level: 6 });
    this.destino = fs.createWriteStream(`${final}.tmp`);
    this.gz.pipe(this.destino);
    this.gz.write(`${cabecalhoCsv()}\n`);
  }
  async escrever(linha: string, numero: number) {
    if (!this.linhas) this.primeira = numero;
    this.ultima = numero;
    this.linhas++;
    this.pendente.push(linha);
    if (this.pendente.length >= 5000) await this.esvaziar();
  }
  private async esvaziar() {
    if (!this.pendente.length) return;
    const ok = this.gz.write(`${this.pendente.join('\n')}\n`);
    this.pendente = [];
    if (!ok) await new Promise((r) => this.gz.once('drain', r));
  }
  async fechar(): Promise<number> {
    await this.esvaziar();
    await new Promise<void>((resolve, reject) => {
      this.destino.on('finish', resolve).on('error', reject);
      this.gz.end();
    });
    fs.renameSync(`${this.final}.tmp`, this.final);
    return fs.statSync(this.final).size;
  }
}

export interface TarefaExtracao {
  caminho: string;
  ano: number | null;
}

/** Extrai um arquivo (roda num processo filho). */
export async function extrairArquivo({ caminho, ano }: TarefaExtracao): Promise<ResumoArquivo> {
  const inicio = Date.now();
  const municipio = carregarMunicipio();
  const dentro = (lat: number, lng: number) => municipio.distritoDe(lat, lng) !== null;
  const base = seguro(path.basename(caminho, path.extname(caminho)));
  const pastaAno = path.join(pastaLimpo(), String(ano ?? 'sem_ano'));
  // Remove partes antigas deste arquivo (de uma extração anterior ou interrompida).
  if (fs.existsSync(pastaAno)) for (const f of fs.readdirSync(pastaAno)) if (f.startsWith(`${base}__`)) fs.rmSync(path.join(pastaAno, f));

  const r: ResumoArquivo = {
    origem: chaveDoArquivo(caminho),
    ano,
    impressao: impressaoDigital(caminho),
    versao: VERSAO_LIMPEZA,
    bytesOrigem: fs.statSync(caminho).size,
    bytesLimpo: 0,
    segundos: 0,
    abas: [],
    lidas: 0,
    mantidas: 0,
    descartadas: {},
    divergencias: {},
    colunasEncontradas: [],
    colunasDescartadas: [],
    colunasFaltando: [],
    partes: [],
  };
  const reader = new ExcelJS.stream.xlsx.WorkbookReader(caminho, {
    sharedStrings: 'cache',
    worksheets: 'emit',
    hyperlinks: 'ignore',
    styles: 'ignore',
    entries: 'ignore',
  });
  for await (const ws of reader) {
    const nomeAba = (ws as unknown as { name?: string }).name ?? `aba${r.abas.length + 1}`;
    const aba = { nome: nomeAba, tipo: 'ignorada' as 'dados' | 'ignorada', lidas: 0, mantidas: 0 };
    r.abas.push(aba);
    let cab: Cabecalho | null = null;
    let parte: EscritorDeParte | null = null;
    let numParte = 0;
    const novaParte = () =>
      new EscritorDeParte(path.join(pastaAno, `${base}__${seguro(nomeAba)}__parte_${String(++numParte).padStart(4, '0')}.csv.gz`));
    const fecharParte = async () => {
      if (!parte) return;
      const bytes = await parte.fechar();
      r.bytesLimpo += bytes;
      r.partes.push({
        arquivo: path.relative(pastaLimpo(), parte.final).split(path.sep).join('/'),
        origem: r.origem,
        ano,
        aba: nomeAba,
        linhas: parte.linhas,
        primeiraLinha: parte.primeira,
        ultimaLinha: parte.ultima,
        bytes,
      });
      parte = null;
    };
    let semCabecalho = 0;
    for await (const row of ws) {
      const values = row.values as unknown[];
      if (!cab) {
        const c = mapearCabecalho(values);
        if (ehCabecalhoDeDados(c)) {
          cab = c;
          aba.tipo = 'dados';
          for (const col of COLUNAS) if (c.indice[col] !== undefined && !r.colunasEncontradas.includes(col)) r.colunasEncontradas.push(col);
        } else if (++semCabecalho > 50) break; // legenda ou aba sem dados
        continue;
      }
      aba.lidas++;
      r.lidas++;
      if (r.lidas % 50_000 === 0) avisarProgresso(r.origem, r.lidas);
      const res = limparLinha(values, cab, { arquivo: r.origem, aba: nomeAba, linha: row.number }, dentro);
      if (res.divergencia) r.divergencias[res.divergencia] = (r.divergencias[res.divergencia] ?? 0) + 1;
      if (!res.linha) {
        r.descartadas[res.descarte!] = (r.descartadas[res.descarte!] ?? 0) + 1;
        continue;
      }
      if (!parte) parte = novaParte();
      await parte.escrever(linhaCsv(res.linha), row.number);
      aba.mantidas++;
      r.mantidas++;
      if (parte.linhas >= LINHAS_POR_PARTE) await fecharParte();
    }
    await fecharParte();
  }
  r.colunasDescartadas = COLUNAS_DESCARTADAS.filter((c) => r.colunasEncontradas.includes(c));
  r.colunasFaltando = COLUNAS.filter((c) => !r.colunasEncontradas.includes(c) && !COLUNAS_DESCARTADAS.includes(c));
  r.segundos = Math.round((Date.now() - inicio) / 1000);
  return r;
}

/** Roda a extração de todas as planilhas (pula as já extraídas). */
export async function extrairTudo(opcoes: { workers?: number; forcar?: boolean } = {}): Promise<{ manifesto: Manifesto; extraidos: string[]; segundos: number }> {
  const inicio = Date.now();
  const planilhas: Planilha[] = listarPlanilhas(pastaSsp());
  if (!planilhas.length) throw new Error(`Nenhuma .xlsx em ${pastaSsp()}`);
  let manifesto = lerManifesto();
  if (manifesto.versao !== VERSAO_LIMPEZA || manifesto.linhasPorParte !== LINHAS_POR_PARTE)
    manifesto = { versao: VERSAO_LIMPEZA, linhasPorParte: LINHAS_POR_PARTE, arquivos: {} };
  // Arquivos que saíram da pasta deixam de valer.
  const atuais = new Set(planilhas.map((p) => chaveDoArquivo(p.caminho)));
  for (const k of Object.keys(manifesto.arquivos)) if (!atuais.has(k)) delete manifesto.arquivos[k];

  const pendentes = planilhas.filter((p) => opcoes.forcar || !jaExtraido(manifesto, p.caminho));
  for (const p of planilhas) if (!pendentes.includes(p)) console.log(`  = ${chaveDoArquivo(p.caminho)}: já extraído (pulado)`);
  if (pendentes.length) {
    const workers = opcoes.workers ?? workersPadrao(1500, pendentes.length);
    console.log(`  Extraindo ${pendentes.length} arquivo(s) com ${workers} processo(s)...`);
    const feito = new Map<string, number>();
    const timer = setInterval(() => {
      const s = (Date.now() - inicio) / 1000;
      const total = [...feito.values()].reduce((a, b) => a + b, 0);
      process.stdout.write(`  ${[...feito].map(([k, n]) => `${path.basename(k, '.xlsx')} ${Math.round(n / 1000)} mil`).join(' | ')} | ${Math.round(total / s)} linhas/s   \r`);
    }, 3000);
    try {
      await rodarEmPool<TarefaExtracao, ResumoArquivo>(__filename, pendentes, {
        workers,
        mbPorFilho: 3500,
        aoProgredir: (p) => feito.set(p.chave, p.feito),
        aoTerminar: (res) => {
          manifesto.arquivos[res.origem] = res; // grava assim que cada arquivo termina (retomada)
          salvarManifesto(manifesto);
          console.log(`\n  ✓ ${res.origem}: ${res.lidas} lidas, ${res.mantidas} mantidas, ${res.partes.length} partes, ${res.segundos} s`);
        },
      });
    } finally {
      clearInterval(timer);
    }
  }
  salvarManifesto(manifesto);
  return { manifesto, extraidos: pendentes.map((p) => chaveDoArquivo(p.caminho)), segundos: Math.round((Date.now() - inicio) / 1000) };
}

/** Todas as partes do manifesto, em ordem (ano, arquivo, aba, número). */
export const partesDoManifesto = (m: Manifesto): Parte[] =>
  Object.values(m.arquivos)
    .flatMap((a) => a.partes)
    .sort((a, b) => a.arquivo.localeCompare(b.arquivo));

if (ehTrabalhador() && require.main === module) servirTarefas(extrairArquivo);
