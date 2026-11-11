/**
 * Filtro do mapa (dia inteiro, período ou hora): nível de um hexágono no filtro, rótulos e avanço da animação.
 * Funções puras (sem React Native), testadas em apps/mobile/test.
 */
import type { Nivel } from '../theme/niveis';
import { PERIODOS, janelaDaHora, nomeDoPeriodo, type IndicePeriodo } from './tempo';

export type ModoFiltro = 'dia_inteiro' | 'periodo' | 'hora';

export interface Filtro {
  modo: ModoFiltro;
  periodo: IndicePeriodo;
  hora: number;
}

/** Intervalo da animação em cada modo. */
export const PASSO_MS: Record<Exclude<ModoFiltro, 'dia_inteiro'>, number> = { periodo: 1200, hora: 700 };

interface NiveisDoHex {
  nivel: Nivel;
  niveisPorPeriodo: (Nivel | null)[] | null;
  niveisPorHora: (Nivel | null)[] | null;
}

/**
 * Nível do hexágono no filtro. null = os níveis do filtro ainda não chegaram do banco (a tela mantém a cor anterior).
 * Um período/hora sem registro vem como nível 1.
 */
export function nivelNoFiltro(h: NiveisDoHex, f: Filtro): Nivel | null {
  if (f.modo === 'dia_inteiro') return h.nivel;
  const lista = f.modo === 'periodo' ? h.niveisPorPeriodo : h.niveisPorHora;
  if (!lista) return null;
  return lista[f.modo === 'periodo' ? f.periodo : f.hora] ?? 1;
}

/** O que o banco precisa mandar para o filtro. */
export const dadosDoFiltro = (modo: ModoFiltro) => ({ comPeriodos: modo !== 'dia_inteiro', comHoras: modo === 'hora' });

/** Os hexágonos já têm os níveis que o filtro usa? */
export function temDadosDoFiltro(h: Pick<NiveisDoHex, 'niveisPorPeriodo' | 'niveisPorHora'>, modo: ModoFiltro): boolean {
  if (modo === 'periodo') return !!h.niveisPorPeriodo;
  if (modo === 'hora') return !!h.niveisPorHora;
  return true;
}

/** Rótulo curto do filtro: "Dia inteiro", "Noite" ou "18h–21h". */
export function rotuloFiltro(f: Filtro): string {
  if (f.modo === 'periodo') return PERIODOS[f.periodo].nome;
  if (f.modo === 'hora') return janelaDaHora(f.hora);
  return 'Dia inteiro';
}

const intervaloFalado = (texto: string) => texto.replace('–', ' às ');

/** "Período: noite, 18h às 24h" */
export const rotuloAcessivelPeriodo = (p: IndicePeriodo) =>
  `Período: ${nomeDoPeriodo(p)}, ${PERIODOS[p].inicio}h às ${PERIODOS[p].fim}h`;

/** "Hora: 19h, registros de 18h às 21h" */
export const rotuloAcessivelHora = (hora: number) => `Hora: ${hora}h, registros de ${intervaloFalado(janelaDaHora(hora))}`;

/** Próximo (ou anterior, com passo −1) período/hora, em loop. */
export function avancar(f: Filtro, passo: 1 | -1 = 1): Filtro {
  if (f.modo === 'periodo') return { ...f, periodo: ((((f.periodo + passo) % 4) + 4) % 4) as IndicePeriodo };
  if (f.modo === 'hora') return { ...f, hora: (((f.hora + passo) % 24) + 24) % 24 };
  return f;
}

/**
 * Linha do balão: "Noite: nível 9 · Dia inteiro: nível 7" (ou "18h–21h: nível 8 · …").
 * null no dia inteiro (o selo já mostra o nível).
 */
export function fraseNivelDoFiltro(nivelFiltro: Nivel | null, nivelDia: Nivel, f: Filtro): string | null {
  if (f.modo === 'dia_inteiro') return null;
  const filtro = nivelFiltro === null ? 'carregando…' : `nível ${nivelFiltro}`;
  return `${rotuloFiltro(f)}: ${filtro} · Dia inteiro: nível ${nivelDia}`;
}
