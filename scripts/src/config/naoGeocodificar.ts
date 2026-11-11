import { normalizeText, type CrimeCategory } from './crimeWeights';

/**
 * BOs que NUNCA são geocodificados pelo endereço (decisão 6, aprovada): a SSP oculta a localização de propósito
 * ou a vítima pode ser identificada. Vale também para BOs com coordenada 0 e endereço real.
 *
 * - logradouro com o aviso de sigilo da SSP ("VEDAÇÃO DA DIVULGAÇÃO DOS DADOS RELATIVOS");
 * - crimes sexuais (estupro entra pela distribuição no distrito, não pelo endereço);
 * - violência doméstica / Lei Maria da Penha;
 * - vítima criança, adolescente ou vulnerável (inclui ECA).
 */
export const CATEGORIAS_SEM_GEOCODIFICACAO: CrimeCategory[] = ['estupro'];

export const TEXTOS_SEM_GEOCODIFICACAO: RegExp[] = [
  /VEDACAO DA DIVULGACAO/,
  /ESTUPRO|SEXUAL|LIBIDINOS|ATENTADO VIOLENTO AO PUDOR|IMPORTUNACAO|ASSEDIO|EXPLORACAO SEXUAL|PORNOGRAF|LENOCINIO|CORRUPCAO DE MENOR/,
  /VIOLENCIA DOMESTICA|MARIA DA PENHA|11\.?340|FEMINICIDIO|DESCUMPRIMENTO DE MEDIDA PROTETIVA|MEDIDA PROTETIVA/,
  /CRIANCA|ADOLESCENTE|VULNERAVEL|MENOR DE (14|18)|\bECA\b|8\.?069|ABANDONO DE INCAPAZ|MAUS[ -]TRATOS/,
];

/** true = não geocodificar (texto de rubrica, conduta, natureza e logradouro do BO). */
export function naoGeocodificar(categoria: CrimeCategory, ...textos: (string | null | undefined)[]): boolean {
  if (CATEGORIAS_SEM_GEOCODIFICACAO.includes(categoria)) return true;
  const t = normalizeText(textos.filter(Boolean).join(' | '));
  return TEXTOS_SEM_GEOCODIFICACAO.some((re) => re.test(t));
}
