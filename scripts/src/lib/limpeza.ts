import crypto from 'crypto';
import type { Cabecalho, Coluna } from './colunas';
import { periodoDoTexto } from './horario';
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
} from './valores';

/**
 * Colunas do CSV limpo (nomes curtos e estáveis entre anos). Os endereços (bairro, logradouro, número) ficam só
 * no computador: servem para geocodificar e conferir coordenadas e nunca vão para o Supabase.
 */
export const COLUNAS_LIMPAS = [
  'id_bo',
  'data_registro',
  'data_ocorrencia',
  'hora',
  'periodo',
  'tipo_local',
  'subtipo_local',
  'bairro',
  'logradouro',
  'numero',
  'lat',
  'lng',
  'sigilo',
  'rubrica',
  'conduta',
  'natureza',
  'mes_estatistica',
  'ano_estatistica',
  'cod_ibge',
  'arquivo',
  'aba',
  'linha',
] as const;
export type ColunaLimpa = (typeof COLUNAS_LIMPAS)[number];

export interface LinhaLimpa {
  id_bo: string | null;
  data_registro: string | null;
  data_ocorrencia: string | null;
  hora: string | null; // "HH:MM"
  periodo: string | null; // madrugada | manha | tarde | noite | incerta (DESC_PERIODO padronizado)
  tipo_local: string | null;
  subtipo_local: string | null;
  bairro: string | null;
  logradouro: string | null;
  numero: number | null;
  lat: number | null;
  lng: number | null;
  sigilo: boolean;
  rubrica: string | null;
  conduta: string | null;
  natureza: string | null;
  mes_estatistica: number | null;
  ano_estatistica: number | null;
  cod_ibge: number | null;
  arquivo: string;
  aba: string;
  linha: number;
}

/** Colunas da planilha que a limpeza descarta (as que o app e as regras não usam). */
export const COLUNAS_DESCARTADAS: Coluna[] = [
  'departamento',
  'seccional',
  'delegacia', // vira id_bo e não é guardada
  'municipio',
  'num_bo',
  'ano_bo',
  'endereco_completo',
  'precisao',
  'delegacia_circunscricao',
  'departamento_circunscricao',
  'seccional_circunscricao',
  'municipio_circunscricao',
  'cmd',
  'btl',
  'cia',
];

/** Chave do BO só para deduplicar: SHA-1 de NUM_BO|ANO_BO|NOME_DELEGACIA (16 hex). null sem NUM_BO. */
export function idBo(numBo: string | null, anoBo: string | null, delegacia: string | null): string | null {
  if (!numBo) return null;
  return crypto.createHash('sha1').update(`${numBo.trim().toUpperCase()}|${(anoBo ?? '').trim()}|${(delegacia ?? '').trim().toUpperCase()}`).digest('hex').slice(0, 16);
}

export type MotivoDescarte = 'fora_da_capital';
export type Divergencia = 'codigo_capital_ponto_fora' | 'codigo_outro_ponto_dentro' | null;

export interface ResultadoLimpeza {
  linha: LinhaLimpa | null;
  descarte: MotivoDescarte | null;
  divergencia: Divergencia;
}

const inteiro = (v: unknown) => {
  const n = Number(valorBruto(v));
  return Number.isInteger(n) && n > 0 ? n : null;
};
const hhmm = (h: { h: number; m: number } | null) => (h ? `${String(h.h).padStart(2, '0')}:${String(h.m).padStart(2, '0')}` : null);

/**
 * Limpa uma linha da planilha. Mantém só a capital: COD IBGE = 3550308 (no formato antigo, o nome do município da
 * circunscrição) OU coordenada dentro dos 96 distritos. Linhas sem coordenada continuam (estupro distribuído pelo
 * distrito e geocodificação).
 */
export function limparLinha(
  values: readonly unknown[],
  cab: Cabecalho,
  origem: { arquivo: string; aba: string; linha: number },
  dentroDaCapital: (lat: number, lng: number) => boolean,
  municipiosIbge: ReadonlySet<number> = new Set([IBGE_CAPITAL]),
): ResultadoLimpeza {
  const v = (c: Coluna) => (cab.indice[c] !== undefined ? values[cab.indice[c]!] : undefined);
  const lat = coordenada(v('lat')).valor;
  const lng = coordenada(v('lng')).valor;
  const temPonto = lat !== null && lng !== null;
  const dentro = temPonto && dentroDaCapital(lat!, lng!);
  const cod = cab.indice.cod_ibge !== undefined ? codigoIbge(v('cod_ibge')) : null;
  const porCodigo =
    cab.indice.cod_ibge !== undefined ? cod !== null && municipiosIbge.has(cod) : ehNomeDaCapital(texto(v('municipio_circunscricao')) ?? texto(v('municipio')));
  const divergencia: Divergencia = porCodigo && temPonto && !dentro ? 'codigo_capital_ponto_fora' : !porCodigo && dentro ? 'codigo_outro_ponto_dentro' : null;
  if (!porCodigo && !dentro) return { linha: null, descarte: 'fora_da_capital', divergencia };

  const logradouro = texto(v('logradouro'));
  const sigilo = ehSigilo(logradouro);
  const p = periodoDoTexto(texto(v('periodo')));
  return {
    descarte: null,
    divergencia,
    linha: {
      id_bo: idBo(texto(v('num_bo')), texto(v('ano_bo')), texto(v('delegacia'))),
      data_registro: data(v('data_registro')).valor,
      data_ocorrencia: data(v('data_ocorrencia')).valor,
      hora: hhmm(hora(v('hora')).valor),
      periodo: p,
      tipo_local: texto(v('tipo_local')),
      subtipo_local: texto(v('subtipo_local')),
      bairro: texto(v('bairro')),
      logradouro: sigilo ? null : logradouro,
      numero: sigilo ? null : numeroLogradouro(v('numero')),
      lat,
      lng,
      sigilo,
      rubrica: texto(v('rubrica')),
      conduta: texto(v('conduta')),
      natureza: texto(v('natureza')),
      mes_estatistica: inteiro(v('mes_estatistica')),
      ano_estatistica: inteiro(v('ano_estatistica')),
      cod_ibge: cod,
      arquivo: origem.arquivo,
      aba: origem.aba,
      linha: origem.linha,
    },
  };
}

// ---------------------------------------------------------------- CSV (vírgula, aspas duplas, UTF-8, LF)

function campo(v: unknown): string {
  if (v === null || v === undefined || v === false) return '';
  if (v === true) return '1';
  const s = String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export const cabecalhoCsv = () => COLUNAS_LIMPAS.join(',');
export const linhaCsv = (l: LinhaLimpa) => COLUNAS_LIMPAS.map((c) => campo(l[c])).join(',');

/** Divide uma linha CSV (aspas duplas com "" de escape). */
export function dividirCsv(linha: string): string[] {
  const out: string[] = [];
  let i = 0;
  while (i <= linha.length) {
    if (linha[i] === '"') {
      let s = '';
      i++;
      while (i < linha.length) {
        if (linha[i] === '"' && linha[i + 1] === '"') {
          s += '"';
          i += 2;
        } else if (linha[i] === '"') {
          i++;
          break;
        } else s += linha[i++];
      }
      out.push(s);
      i++; // vírgula
    } else {
      const fim = linha.indexOf(',', i);
      const f = fim === -1 ? linha.length : fim;
      out.push(linha.slice(i, f));
      i = f + 1;
    }
  }
  return out;
}

const NUMERICAS = new Set<ColunaLimpa>(['numero', 'lat', 'lng', 'mes_estatistica', 'ano_estatistica', 'cod_ibge', 'linha']);

export function lerLinhaCsv(linha: string): LinhaLimpa {
  const campos = dividirCsv(linha);
  const o: Record<string, unknown> = {};
  COLUNAS_LIMPAS.forEach((c, i) => {
    const s = campos[i] ?? '';
    if (c === 'sigilo') o[c] = s === '1';
    else if (NUMERICAS.has(c)) o[c] = s === '' ? null : Number(s);
    else o[c] = s === '' ? null : s;
  });
  return o as unknown as LinhaLimpa;
}
