/**
 * Regras compartilhadas da geocodificação (Etapa 2): quando um BO tenta o endereço, que consulta vai para o
 * geocodificador e o que acontece com o resultado (preenche, troca ponto suspeito ou mantém a coordenada da SSP).
 * Usado pelo `data:geocodificar` (cache, calibração e conferência) e pelo processamento (estágio B).
 */
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import type { CrimeCategory } from '../config/crimeWeights';
import { GEOCODIFICACAO } from '../config/geocodificacao';
import { naoGeocodificar } from '../config/naoGeocodificar';
import { CHAVES_PONTOS_PADRAO, chavePonto } from '../config/pontosPadrao';
import { distanciaM } from '../lib/endereco';
import type { Consulta, Resultado } from '../lib/geocodificador';
import type { LinhaLimpa } from '../lib/limpeza';
import { outDir } from '../lib/paths';

export type RegrasGeocodificacao = typeof GEOCODIFICACAO;

export const pastaCache = () => path.join(outDir, 'cache');
/** Todas as consultas já feitas (uma linha JSON por endereço único), reaproveitadas entre execuções. */
export const arquivoCache = () => path.join(pastaCache(), 'geocodificacao.jsonl');
/** Só as consultas dos BOs candidatos (o que o processamento precisa), gerado pelo data:geocodificar. */
export const arquivoCandidatos = () => path.join(pastaCache(), 'geocodificacao_candidatos.json');

/** Casas decimais como a coordenada foi escrita (o número já vem sem zeros à direita). */
export function casasDecimais(x: number): number {
  const s = String(x);
  const i = s.indexOf('.');
  return i < 0 ? 0 : s.length - i - 1;
}

export const chaveConsulta = (q: Consulta) => `${q.logradouro ?? ''}|${q.numero ?? ''}|${q.bairro ?? ''}|${q.distrito ?? ''}`;

export interface SituacaoDoPonto {
  /** a linha tem lat/lng da SSP */
  temCoordenada: boolean;
  pontoPadrao: boolean;
  foraDoMunicipio: boolean;
  /** coordenada arredondada (até `casasSuspeitas` casas) */
  suspeito: boolean;
  /** distrito do ponto da SSP (null se não há ponto usável) */
  distrito: string | null;
}

export function situacaoDoPonto(
  l: Pick<LinhaLimpa, 'lat' | 'lng'>,
  pontosPadrao: boolean,
  distritoDe: (lat: number, lng: number) => string | null,
  casasSuspeitas = GEOCODIFICACAO.casasSuspeitas,
): SituacaoDoPonto {
  if (l.lat === null || l.lng === null) return { temCoordenada: false, pontoPadrao: false, foraDoMunicipio: false, suspeito: false, distrito: null };
  if (pontosPadrao && CHAVES_PONTOS_PADRAO.has(chavePonto(l.lat, l.lng))) return { temCoordenada: true, pontoPadrao: true, foraDoMunicipio: false, suspeito: false, distrito: null };
  const distrito = distritoDe(l.lat, l.lng);
  if (!distrito) return { temCoordenada: true, pontoPadrao: false, foraDoMunicipio: true, suspeito: false, distrito: null };
  return { temCoordenada: true, pontoPadrao: false, foraDoMunicipio: false, suspeito: Math.max(casasDecimais(l.lat), casasDecimais(l.lng)) <= casasSuspeitas, distrito };
}

/** O BO pode ser geocodificado pelo endereço? (nunca sigilo nem as categorias e textos da lista sensível) */
export const podeGeocodificar = (l: LinhaLimpa, categoria: CrimeCategory) =>
  !l.sigilo && !!l.logradouro && !naoGeocodificar(categoria, l.rubrica, l.conduta, l.natureza, l.logradouro);

export const consultaDe = (l: Pick<LinhaLimpa, 'logradouro' | 'numero' | 'bairro'>, distrito: string | null): Consulta => ({
  logradouro: l.logradouro,
  numero: l.numero,
  bairro: l.bairro,
  distrito,
});

/** Precisa do endereço? Sem ponto usável (sem coordenada ou ponto padrão) ou ponto suspeito. */
export const ehCandidato = (s: SituacaoDoPonto) => !s.temCoordenada || s.pontoPadrao || s.suspeito;

export type Decisao =
  | { origem: 'ssp'; lat: number; lng: number; geo: Resultado | null; distanciaM: number | null }
  | { origem: 'preenchido'; lat: number; lng: number; geo: Resultado }
  | { origem: 'trocado'; lat: number; lng: number; geo: Resultado; distanciaM: number }
  | { origem: 'sem'; motivo: 'pontoPadrao' | 'pontoForaDoMunicipio' | null; geo: Resultado | null; bloqueado: boolean };

/** O resultado chegou a um nível aceito, com o distrito vindo de uma fonte aceita para esse nível ('nenhuma' = sem distrito)? */
export const nivelAceito = (geo: Resultado, regras: RegrasGeocodificacao) =>
  !!geo.ok && (regras.aceitar[geo.nivel!] ?? []).includes(geo.dica ?? 'nenhuma');

/**
 * Decide a coordenada final do BO.
 *   - ponto padrão / fora do município → perde a coordenada;
 *   - sem ponto usável → preenche se o endereço chega a um nível aceito e cai dentro da capital;
 *   - ponto suspeito → troca se o endereço (nível aceito) estiver a mais de `trocarAcimaDeM`;
 *   - ponto confiável → fica o da SSP (a divergência só é medida quando `geocodificar` responde).
 * `geocodificar` null = sem geocodificação (linha de base).
 */
export function decidir(
  l: LinhaLimpa,
  categoria: CrimeCategory,
  s: SituacaoDoPonto,
  regras: RegrasGeocodificacao | null,
  geocodificar: ((q: Consulta) => Resultado | null) | null,
  distritoDe: (lat: number, lng: number) => string | null,
  medirDivergencia = false,
): Decisao {
  const usavel = s.temCoordenada && !s.pontoPadrao && !s.foraDoMunicipio;
  const motivo = s.pontoPadrao ? 'pontoPadrao' : s.foraDoMunicipio ? 'pontoForaDoMunicipio' : null;
  const pode = !!regras && !!geocodificar && podeGeocodificar(l, categoria);
  const tentar = pode && (ehCandidato(s) || (usavel && medirDivergencia)) && !s.foraDoMunicipio;
  const geo = tentar ? geocodificar!(consultaDe(l, s.distrito)) : null;
  const aceito = !!geo && nivelAceito(geo, regras!) && !!distritoDe(geo.lat!, geo.lng!);
  if (usavel) {
    const d = aceito ? distanciaM(l.lat!, l.lng!, geo!.lat!, geo!.lng!) : null;
    if (aceito && s.suspeito && d! > regras!.trocarAcimaDeM) return { origem: 'trocado', lat: geo!.lat!, lng: geo!.lng!, geo: geo!, distanciaM: d! };
    return { origem: 'ssp', lat: l.lat!, lng: l.lng!, geo, distanciaM: d };
  }
  if (aceito) return { origem: 'preenchido', lat: geo!.lat!, lng: geo!.lng!, geo: geo! };
  return { origem: 'sem', motivo, geo, bloqueado: !!regras && !s.foraDoMunicipio && !!l.logradouro && !pode };
}

// ------------------------------------------------------------------------------- resultados para o estágio B

export function lerCandidatos(): { mapa: Map<string, Resultado>; hash: string } {
  const f = arquivoCandidatos();
  if (!fs.existsSync(f)) throw new Error('Geocodificação não encontrada. Rode antes: npm run data:geocodificar');
  const texto = fs.readFileSync(f, 'utf-8');
  return { mapa: new Map(Object.entries(JSON.parse(texto) as Record<string, Resultado>)), hash: crypto.createHash('sha1').update(texto).digest('hex').slice(0, 12) };
}

export function hashDosCandidatos(): string {
  const f = arquivoCandidatos();
  return fs.existsSync(f) ? crypto.createHash('sha1').update(fs.readFileSync(f)).digest('hex').slice(0, 12) : 'sem-arquivo';
}
