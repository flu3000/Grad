/**
 * Pesos por tipo de crime, usados para calcular a nota de perigo de cada hexágono.
 * Aprovados pelo dono do projeto em 10/11/2026.
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
  | 'lesao_seguida_morte'
  | 'roubo_veiculo'
  | 'roubo_carga'
  | 'roubo_outros'
  | 'lesao_dolosa'
  | 'furto_veiculo'
  | 'furto_outros'
  | 'nao_criminal'
  | 'outros';

export const CRIME_WEIGHTS: Record<CrimeCategory, number> = {
  latrocinio: 10,
  homicidio_doloso: 10,
  estupro: 9,
  lesao_seguida_morte: 8,
  roubo_veiculo: 6,
  roubo_carga: 6,
  roubo_outros: 4,
  lesao_dolosa: 3,
  furto_veiculo: 2,
  furto_outros: 1,
  outros: 0.5, // infrações leves e demais crimes
  nao_criminal: 0, // registros que não indicam perigo (perda de documento, desaparecimento, achado...)
};

export const CRIME_RULES: [CrimeCategory, RegExp][] = [
  ['nao_criminal', /\b(PERDA|EXTRAVIO|DESAPARECIMENTO|ENCONTRO DE|ACHADO|LOCALIZACAO DE|MORTE SUSPEITA|MORTE NATURAL|SUICIDIO|NAO CRIMINAL|FATO ATIPICO)\b/],
  ['latrocinio', /LATROCINIO|ROUBO SEGUIDO DE MORTE/],
  ['lesao_seguida_morte', /LESAO CORPORAL SEGUIDA DE MORTE/],
  ['outros', /CULPOS[OA]/], // homicídio/lesão culposa (ex.: trânsito) não indicam perigo intencional
  ['homicidio_doloso', /HOMICIDIO|FEMINICIDIO/],
  ['estupro', /ESTUPRO/],
  ['roubo_carga', /ROUBO\b.*\bCARGA/],
  ['roubo_veiculo', /ROUBO\b.*\bVEICULO/],
  ['roubo_outros', /\bROUBO/],
  ['lesao_dolosa', /LESAO CORPORAL/],
  ['furto_veiculo', /FURTO\b.*\bVEICULO/],
  ['furto_outros', /\bFURTO/],
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
