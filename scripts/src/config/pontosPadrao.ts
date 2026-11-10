/**
 * Pontos "padrão" da SSP: a mesma coordenada usada para BOs de endereços diferentes (provável valor padrão do
 * sistema, não o local do fato). BOs nesses pontos passam a ser "sem localização" (aprovado em 10/11/2026 para
 * Perus; os outros candidatos aparecem no relatório antes de entrar aqui).
 */
export interface PontoPadrao {
  lat: number;
  lng: number;
  descricao: string;
}

export const PONTOS_PADRAO: PontoPadrao[] = [{ lat: -23.405645, lng: -46.734928, descricao: 'Perus, logradouro "ACESSO ACESSO" (400+ BOs por ano)' }];

/** Chave com 6 casas decimais, a mesma do diagnóstico. */
export const chavePonto = (lat: number, lng: number) => `${lat.toFixed(6)},${lng.toFixed(6)}`;

export const CHAVES_PONTOS_PADRAO = new Set(PONTOS_PADRAO.map((p) => chavePonto(p.lat, p.lng)));
