import { normalizeText } from '../config/crimeWeights';

/**
 * Leitura dos valores das células das planilhas da SSP-SP. O exceljs (sem estilos) entrega datas como número
 * serial do Excel, horas como fração do dia, fórmulas como { formula, result } e textos ricos como { richText }.
 * Cada função devolve o valor padronizado e o "formato" encontrado, que o diagnóstico conta.
 */

export function cellText(v: unknown): string {
  if (v == null) return '';
  if (v instanceof Date) return v.toISOString();
  if (typeof v === 'object' && 'richText' in v) return (v as { richText: { text: string }[] }).richText.map((t) => t.text).join('');
  if (typeof v === 'object' && 'result' in v) return cellText((v as { result: unknown }).result);
  if (typeof v === 'object' && 'error' in v) return '';
  return String(v);
}

/** Resultado de fórmula → valor; o resto passa direto. */
export function valorBruto(v: unknown): unknown {
  return v && typeof v === 'object' && !(v instanceof Date) && 'result' in v ? valorBruto((v as { result: unknown }).result) : v;
}

/** Textos que a SSP usa para "sem valor". "NUL,L" aparece nas fórmulas da planilha antiga de 2025. */
const NULOS = new Set(['', 'NULL', 'NUL,L', '-', '(VAZIO)', 'VAZIO', 'N/D', 'NA']);

export const ehNulo = (v: unknown) => NULOS.has(normalizeText(cellText(valorBruto(v))));

/** Texto limpo ou null (sem espaços sobrando; nulos da SSP viram null). */
export function texto(v: unknown): string | null {
  const t = cellText(valorBruto(v)).replace(/\s+/g, ' ').trim();
  return NULOS.has(normalizeText(t)) ? null : t;
}

export type FormatoCoordenada = 'numero' | 'texto_virgula' | 'texto_ponto' | 'zero' | 'nulo' | 'invalido';

/** Coordenada: número ou texto com vírgula/ponto decimal. 0 e nulos → null. */
export function coordenada(v: unknown): { valor: number | null; formato: FormatoCoordenada } {
  const b = valorBruto(v);
  if (typeof b === 'number') return Number.isFinite(b) && b !== 0 ? { valor: b, formato: 'numero' } : { valor: null, formato: b === 0 ? 'zero' : 'invalido' };
  if (ehNulo(b)) return { valor: null, formato: 'nulo' };
  const t = cellText(b).trim();
  const virgula = t.includes(',');
  const n = Number(t.replace(',', '.'));
  if (!Number.isFinite(n)) return { valor: null, formato: 'invalido' };
  if (n === 0) return { valor: null, formato: 'zero' };
  return { valor: n, formato: virgula ? 'texto_virgula' : 'texto_ponto' };
}

export type FormatoData = 'date' | 'serial' | 'iso' | 'br' | 'nulo' | 'invalido';

const pad = (n: number) => String(n).padStart(2, '0');
const iso = (d: Date) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;

/** Data → "AAAA-MM-DD". Aceita Date, serial do Excel, "AAAA-MM-DD[...]" e "DD/MM/AAAA[...]". */
export function data(v: unknown): { valor: string | null; formato: FormatoData } {
  const b = valorBruto(v);
  if (b instanceof Date) return Number.isNaN(b.getTime()) ? { valor: null, formato: 'invalido' } : { valor: iso(b), formato: 'date' };
  // Serial do Excel: dias desde 1899-12-30 (a parte fracionária é a hora). 20000..80000 ≈ 1954..2119.
  if (typeof b === 'number') {
    if (b > 20000 && b < 80000) return { valor: iso(new Date(Math.round((Math.floor(b) - 25569) * 86400000))), formato: 'serial' };
    return { valor: null, formato: 'invalido' };
  }
  if (ehNulo(b)) return { valor: null, formato: 'nulo' };
  const t = cellText(b).trim();
  let m = t.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return { valor: `${m[1]}-${m[2]}-${m[3]}`, formato: 'iso' };
  m = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (m) return { valor: `${m[3]}-${pad(+m[2])}-${pad(+m[1])}`, formato: 'br' };
  return { valor: null, formato: 'invalido' };
}

export type FormatoHora = 'fracao' | 'serial_com_hora' | 'date' | 'texto_hms' | 'texto_hm' | 'nulo' | 'invalido';

export interface Hora {
  h: number;
  m: number;
  s: number;
}

function deSegundos(total: number): Hora {
  const t = ((Math.round(total) % 86400) + 86400) % 86400;
  return { h: Math.floor(t / 3600), m: Math.floor((t % 3600) / 60), s: t % 60 };
}

/**
 * Hora da ocorrência. Formatos: fração do dia (0.625 = 15:00), serial com hora (46027.625), Date
 * (1899-12-30T15:00, o exceljs usa UTC), "HH:MM" ou "HH:MM:SS"; "NULL"/vazio → null.
 */
export function hora(v: unknown): { valor: Hora | null; formato: FormatoHora } {
  const b = valorBruto(v);
  if (b instanceof Date) {
    if (Number.isNaN(b.getTime())) return { valor: null, formato: 'invalido' };
    return { valor: { h: b.getUTCHours(), m: b.getUTCMinutes(), s: b.getUTCSeconds() }, formato: 'date' };
  }
  if (typeof b === 'number') {
    if (b >= 0 && b < 1) return { valor: deSegundos(b * 86400), formato: 'fracao' };
    if (b >= 1 && b < 80000) return { valor: deSegundos((b - Math.floor(b)) * 86400), formato: 'serial_com_hora' };
    return { valor: null, formato: 'invalido' };
  }
  if (ehNulo(b)) return { valor: null, formato: 'nulo' };
  const m = cellText(b).trim().match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (!m || +m[1] > 23 || +m[2] > 59) return { valor: null, formato: 'invalido' };
  return { valor: { h: +m[1], m: +m[2], s: m[3] ? +m[3] : 0 }, formato: m[3] ? 'texto_hms' : 'texto_hm' };
}

/** Número do logradouro: inteiro > 0, ou null (0, vazio, "S/N" = sem número). */
export function numeroLogradouro(v: unknown): number | null {
  const b = valorBruto(v);
  const n = typeof b === 'number' ? b : Number(cellText(b).trim().replace(/\D+$/, ''));
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : null;
}

/** Logradouro substituído pelo aviso de sigilo da SSP ("VEDAÇÃO DA DIVULGAÇÃO DOS DADOS RELATIVOS"). */
export const ehSigilo = (logradouro: string | null) => !!logradouro && /VEDACAO DA DIVULGACAO/.test(normalizeText(logradouro));

/** Código IBGE do município de São Paulo. */
export const IBGE_CAPITAL = 3550308;

export function codigoIbge(v: unknown): number | null {
  const b = valorBruto(v);
  const n = typeof b === 'number' ? b : Number(cellText(b).trim());
  return Number.isInteger(n) && n > 0 ? n : null;
}

/** Nome do município da capital na planilha antiga (sem COD IBGE): "S.PAULO", "SAO PAULO". */
export const ehNomeDaCapital = (nome: string | null) => !!nome && /^(S\.? ?PAULO|SAO PAULO)$/.test(normalizeText(nome));
