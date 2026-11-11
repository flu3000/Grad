/**
 * Conferência com as estatísticas oficiais da SSP (Etapa 4): totais da capital por ano estatístico e categoria.
 *
 *   - nossos números: todas as linhas da capital (COD IBGE 3550308, com e sem coordenada), pelo
 *     ANO_ESTATISTICA / MES_ESTATISTICA; um BO conta uma vez em cada categoria que ele tem (como a estatística por
 *     natureza da SSP), não só na mais grave;
 *   - números oficiais: planilhas baixadas pelo dono em data/SSP-SP/oficial/ (xlsx ou csv), uma tabela por ano com
 *     as naturezas nas linhas e os meses nas colunas.
 */
import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import ExcelJS from 'exceljs';
import { normalizeText, type CrimeCategory } from '../config/crimeWeights';
import { lerLinhaCsv } from '../lib/limpeza';
import { IBGE_CAPITAL } from '../lib/valores';
import { lerManifesto, partesDoManifesto, pastaLimpo, pastaSsp } from './extracao';
import { classificar, type Regras } from './processamento';

/** Categorias comparadas e a linha correspondente da tabela da SSP (texto normalizado). */
export const CATEGORIAS_OFICIAIS: { categoria: CrimeCategory; rotulo: string; casa: (t: string) => boolean }[] = [
  { categoria: 'homicidio_doloso', rotulo: 'HOMICÍDIO DOLOSO', casa: (t) => t.startsWith('HOMICIDIO DOLOSO') && !/ACIDENTE|VITIMA|TENTATIVA/.test(t) },
  { categoria: 'latrocinio', rotulo: 'LATROCÍNIO', casa: (t) => t.startsWith('LATROCINIO') && !/VITIMA/.test(t) },
  { categoria: 'estupro', rotulo: 'TOTAL DE ESTUPRO', casa: (t) => t.startsWith('TOTAL DE ESTUPRO') },
  { categoria: 'roubo_veiculo', rotulo: 'ROUBO DE VEÍCULO', casa: (t) => t.startsWith('ROUBO DE VEICULO') },
  { categoria: 'furto_veiculo', rotulo: 'FURTO DE VEÍCULO', casa: (t) => t.startsWith('FURTO DE VEICULO') },
  { categoria: 'roubo_outros', rotulo: 'ROUBO - OUTROS', casa: (t) => /^ROUBO\s*-?\s*OUTROS/.test(t) },
  { categoria: 'furto_outros', rotulo: 'FURTO - OUTROS', casa: (t) => /^FURTO\s*-?\s*OUTROS/.test(t) },
];

export type PorAnoMes = Record<number, Record<string, number[]>>; // ano → categoria → [12 meses]

/** Nossos totais: linhas da capital por ano/mês estatístico, um BO por categoria. */
export function contarNossos(regras: Pick<Regras, 'tema506'>, anos: number[]): { contagem: PorAnoMes; semAnoEstatistico: number } {
  const alvo = new Set(CATEGORIAS_OFICIAIS.map((c) => c.categoria));
  const contagem: PorAnoMes = {};
  const vistos = new Set<string>();
  let semAnoEstatistico = 0;
  for (const p of partesDoManifesto(lerManifesto())) {
    const texto = zlib.gunzipSync(fs.readFileSync(path.join(pastaLimpo(), p.arquivo))).toString('utf-8');
    for (const linha of texto.split('\n').slice(1)) {
      if (!linha) continue;
      const l = lerLinhaCsv(linha);
      if (l.cod_ibge !== IBGE_CAPITAL) continue;
      const categoria = classificar(l.rubrica, l.natureza, regras);
      if (!alvo.has(categoria)) continue;
      let ano = l.ano_estatistica;
      let mes = l.mes_estatistica;
      if (!ano || !mes) {
        semAnoEstatistico++;
        if (!l.data_registro) continue;
        ano = Number(l.data_registro.slice(0, 4));
        mes = Number(l.data_registro.slice(5, 7));
      }
      if (!anos.includes(ano)) continue;
      if (l.id_bo) {
        const k = `${l.id_bo}|${categoria}`;
        if (vistos.has(k)) continue;
        vistos.add(k);
      }
      ((contagem[ano] ??= {})[categoria] ??= Array(12).fill(0))[mes - 1]++;
    }
  }
  return { contagem, semAnoEstatistico };
}

export const pastaOficial = () => path.join(pastaSsp(), 'oficial');

const MESES = ['JAN', 'FEV', 'MAR', 'ABR', 'MAI', 'JUN', 'JUL', 'AGO', 'SET', 'OUT', 'NOV', 'DEZ'];

/** Lê uma tabela (linhas de células) da SSP: acha o cabeçalho com os meses e as linhas das categorias. */
export function lerTabelaOficial(linhas: unknown[][], ano: number): Record<string, number[]> {
  const txt = (v: unknown) => normalizeText(String(v ?? ''));
  const iCab = linhas.findIndex((l) => l.filter((c) => MESES.includes(txt(c).slice(0, 3))).length >= 3);
  if (iCab < 0) throw new Error(`cabeçalho com os meses não encontrado (${ano})`);
  const cab = linhas[iCab].map((c) => txt(c).slice(0, 3));
  const colMes = MESES.map((m) => cab.indexOf(m));
  const out: Record<string, number[]> = {};
  for (const l of linhas.slice(iCab + 1)) {
    const rotulo = l.map(txt).find((t) => /[A-Z]/.test(t));
    if (!rotulo) continue;
    const c = CATEGORIAS_OFICIAIS.find((x) => x.casa(rotulo));
    if (!c || out[c.categoria]) continue;
    out[c.categoria] = colMes.map((j) => {
      if (j < 0) return 0;
      const v = l[j];
      const n = typeof v === 'number' ? v : Number(String(v ?? '').replace(/\./g, '').replace(',', '.'));
      return Number.isFinite(n) ? n : 0;
    });
  }
  return out;
}

/** Lê os arquivos de data/SSP-SP/oficial/ (o ano vem do nome do arquivo). */
export async function lerOficiais(): Promise<{ porAno: Record<number, Record<string, number[]>>; arquivos: string[]; erros: string[] }> {
  const pasta = pastaOficial();
  const porAno: Record<number, Record<string, number[]>> = {};
  const erros: string[] = [];
  if (!fs.existsSync(pasta)) return { porAno, arquivos: [], erros };
  const arquivos = fs.readdirSync(pasta).filter((f) => /\.(xlsx|csv)$/i.test(f));
  for (const f of arquivos) {
    const ano = Number(f.match(/20\d\d/)?.[0]);
    if (!ano) {
      erros.push(`${f}: sem o ano no nome do arquivo`);
      continue;
    }
    try {
      let linhas: unknown[][];
      if (/\.csv$/i.test(f)) {
        const t = fs.readFileSync(path.join(pasta, f), 'utf-8').replace(/^﻿/, '');
        const sep = (t.split('\n')[0].match(/;/g)?.length ?? 0) >= (t.split('\n')[0].match(/,/g)?.length ?? 0) ? ';' : ',';
        linhas = t.split(/\r?\n/).map((l) => l.split(sep).map((c) => c.replace(/^"|"$/g, '').trim()));
      } else {
        const wb = new ExcelJS.Workbook();
        await wb.xlsx.readFile(path.join(pasta, f));
        linhas = [];
        for (const ws of wb.worksheets) ws.eachRow((r) => linhas.push((r.values as unknown[]).slice(1).map((v) => (v && typeof v === 'object' && 'result' in v ? (v as { result: unknown }).result : v))));
      }
      porAno[ano] = { ...(porAno[ano] ?? {}), ...lerTabelaOficial(linhas, ano) };
    } catch (e) {
      erros.push(`${f}: ${e instanceof Error ? e.message : e}`);
    }
  }
  return { porAno, arquivos, erros };
}
