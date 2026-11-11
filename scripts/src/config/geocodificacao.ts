/**
 * Regras de uso da geocodificação pelo CNEFE (Etapa 2). Os níveis aceitos saem da calibração
 * (`npm run data:geocodificar`): distância entre o endereço geocodificado e a coordenada confiável da SSP.
 */
export type Dica = 'ponto' | 'bairro' | 'localidade';

export const GEOCODIFICACAO = {
  /**
   * Nível aceito → de onde pode vir o distrito usado no desempate (ponto da SSP, BAIRRO = nome do distrito ou
   * BAIRRO = localidade do CNEFE). Sem distrito nenhum, não geocodifica: o nome único na cidade não basta
   * ("PARQUE DO IBIRAPUERA" caía numa rua homônima em Cidade Dutra). Proposta da calibração de 10/11/2026,
   * aguardando aprovação; o curto (centro do logradouro, mediana ~150 m) fica de fora até a decisão.
   */
  aceitar: {
    exato: ['ponto', 'bairro', 'localidade'],
    exato_aproximado: ['ponto', 'bairro', 'localidade'],
    interpolado: ['ponto', 'bairro'],
    interpolado_aproximado: ['ponto', 'bairro', 'localidade'],
  } as Record<string, Dica[]>,
  /** Ponto suspeito só é trocado se o endereço estiver a mais disso. */
  trocarAcimaDeM: 300,
  /** Coordenada com até estas casas decimais é suspeita (arredondada, ~110 m). */
  casasSuspeitas: 3,
};
