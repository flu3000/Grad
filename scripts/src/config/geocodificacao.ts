/**
 * Regras de uso da geocodificação pelo CNEFE (Etapa 2). Os níveis aceitos saem da calibração
 * (`npm run data:geocodificar`): distância entre o endereço geocodificado e a coordenada confiável da SSP.
 */
/** De onde veio o distrito usado no desempate: ponto da SSP, BAIRRO = nome do distrito, BAIRRO = localidade do CNEFE. */
export type Dica = 'ponto' | 'bairro' | 'localidade' | 'nenhuma';

export const GEOCODIFICACAO = {
  /**
   * Nível aceito → origens de distrito aceitas para esse nível. Aprovado em 11/11/2026:
   *   - exato e aproximado: qualquer origem;
   *   - interpolado: só o ponto da SSP ou BAIRRO = distrito;
   *   - curto (centro de logradouro < 1 km): só BAIRRO = distrito (mediana ~150 m, p90 ~570 m);
   *   - conhecido (lista curada em enderecosConhecidos.ts): sempre;
   *   - sem distrito nenhum, não geocodifica: o nome único na cidade não basta ("PARQUE DO IBIRAPUERA" caía numa
   *     rua homônima em Cidade Dutra).
   */
  aceitar: {
    conhecido: ['ponto', 'bairro', 'localidade', 'nenhuma'],
    exato: ['ponto', 'bairro', 'localidade'],
    exato_aproximado: ['ponto', 'bairro', 'localidade'],
    interpolado: ['ponto', 'bairro'],
    interpolado_aproximado: ['ponto', 'bairro', 'localidade'],
    curto: ['bairro'],
  } as Record<string, Dica[]>,
  /** Ponto suspeito só é trocado se o endereço estiver a mais disso. */
  trocarAcimaDeM: 300,
  /** Coordenada com até estas casas decimais é suspeita (arredondada, ~110 m). */
  casasSuspeitas: 3,
};
