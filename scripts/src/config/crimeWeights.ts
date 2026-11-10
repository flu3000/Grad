/**
 * Pesos por tipo de crime, usados para calcular a nota de perigo de cada hexágono.
 * Aprovados pelo dono do projeto em 10/11/2026 (extorsão mediante sequestro, arma, tráfico e culposo
 * acrescentados depois do primeiro relatório com a planilha real, também aprovados).
 *
 * As regras são testadas EM ORDEM contra o texto `RUBRICA | NATUREZA_APURADA` normalizado
 * (maiúsculas, sem acento); vale a primeira que casar. Por isso as mais específicas vêm antes
 * (ex.: "latrocínio" antes de "roubo", "lesão culposa" antes de "lesão corporal").
 * Rode `npm run import:crimes` (sem --gravar) para ver o relatório de textos que caíram em "outros".
 */

export type CrimeCategory =
  | 'latrocinio'
  | 'homicidio_doloso'
  | 'estupro'
  | 'extorsao_sequestro'
  | 'lesao_seguida_morte'
  | 'roubo_veiculo'
  | 'roubo_carga'
  | 'roubo_outros'
  | 'lesao_dolosa'
  | 'furto_veiculo'
  | 'furto_outros'
  | 'porte_arma'
  | 'trafico'
  | 'culposo'
  | 'nao_criminal'
  | 'outros';

export const CRIME_WEIGHTS: Record<CrimeCategory, number> = {
  latrocinio: 10,
  homicidio_doloso: 10,
  estupro: 9, // a SSP não publica coordenada de crimes sexuais: entram pelo distrito (ver abaixo)
  extorsao_sequestro: 9,
  lesao_seguida_morte: 8,
  roubo_veiculo: 6,
  roubo_carga: 6,
  roubo_outros: 4,
  lesao_dolosa: 3,
  furto_veiculo: 2,
  furto_outros: 1,
  porte_arma: 3,
  trafico: 2,
  culposo: 0, // lesão/homicídio culposo, sem intenção (quase todo de trânsito): risco de acidente, não de crime
  outros: 0.5, // infrações leves e demais crimes
  nao_criminal: 0, // registros que não indicam perigo (perda de documento, desaparecimento, achado...)
};

/**
 * Categorias cujos BOs SEM coordenada são aproveitados: se forem da capital, em local público e o BAIRRO casar
 * com o nome de um distrito, o peso é dividido entre os hexágonos do distrito.
 */
export const DISTRIBUIR_SEM_LOCALIZACAO: CrimeCategory[] = ['estupro'];

export const CRIME_RULES: [CrimeCategory, RegExp][] = [
  ['nao_criminal', /\b(PERDA|EXTRAVIO|DESAPARECIMENTO|ENCONTRO DE|ACHADO|LOCALIZACAO DE|MORTE SUSPEITA|MORTE NATURAL|SUICIDIO|NAO CRIMINAL|FATO ATIPICO)\b/],
  ['latrocinio', /LATROCINIO|ROUBO SEGUIDO DE MORTE/],
  ['lesao_seguida_morte', /LESAO CORPORAL SEGUIDA DE MORTE/],
  ['culposo', /CULPOS[OA]/],
  ['homicidio_doloso', /HOMICIDIO|FEMINICIDIO/],
  ['estupro', /ESTUPRO/],
  ['extorsao_sequestro', /SEQUESTRO|CARCERE PRIVADO/],
  ['roubo_carga', /ROUBO\b.*\bCARGA/],
  ['roubo_veiculo', /ROUBO\b.*\bVEICULO/],
  ['roubo_outros', /\bROUBO/],
  ['lesao_dolosa', /LESAO CORPORAL/],
  ['furto_veiculo', /FURTO\b.*\bVEICULO/],
  ['furto_outros', /\bFURTO/],
  ['trafico', /TRAFICO/], // tráfico e associação para o tráfico (porte para consumo continua em "outros")
  ['porte_arma', /\bARMAS?\b|DESARMAMENTO|10\.?826/], // depois de roubo/lesão: "roubo com arma" segue roubo
];

export function normalizeText(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/\s+/g, ' ')
    .trim();
}

export function classifyCrime(rubrica: string, natureza: string): CrimeCategory {
  const text = normalizeText(`${rubrica} | ${natureza}`);
  for (const [category, rule] of CRIME_RULES) if (rule.test(text)) return category;
  return 'outros';
}
