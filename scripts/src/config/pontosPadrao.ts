/**
 * Pontos "padrão" da SSP: a mesma coordenada usada para BOs de endereços diferentes (provável valor padrão do
 * sistema, não o local do fato). O BO num ponto padrão perde a coordenada e vira candidato à geocodificação pelo
 * endereço; se não der, fica "sem localização".
 *
 * PONTOS_PADRAO são os confirmados pelo dono. O detector (DETECTOR_PONTO_PADRAO, `npm run data:geocodificar`)
 * lista os candidatos para aprovação: coordenada com muitos BOs e endereços muito diferentes entre si.
 */
export interface PontoPadrao {
  lat: number;
  lng: number;
  descricao: string;
}

export const PONTOS_PADRAO: PontoPadrao[] = [
  { lat: -23.405645, lng: -46.734928, descricao: 'Perus, logradouro "ACESSO ACESSO" (400+ BOs por ano); aprovado em 10/11/2026' },
  { lat: -23.4056, lng: -46.734928, descricao: 'Perus, o mesmo ponto com uma casa a menos ("ACESSO ACESSO", 38 BOs em 2024); aprovado em 10/11/2026' },
  { lat: -23.555771, lng: -46.639557, descricao: 'Liberdade/Bela Vista, centenas de logradouros diferentes no mesmo ponto; aprovado em 10/11/2026' },
];

/** Candidato a ponto padrão: pelo menos `minBos` BOs e logradouros distintos ÷ BOs ≥ `razaoMinima`. */
export const DETECTOR_PONTO_PADRAO = { minBos: 50, razaoMinima: 0.5 };

/** Chave com 6 casas decimais, a mesma do diagnóstico. */
export const chavePonto = (lat: number, lng: number) => `${lat.toFixed(6)},${lng.toFixed(6)}`;

export const CHAVES_PONTOS_PADRAO = new Set(PONTOS_PADRAO.map((p) => chavePonto(p.lat, p.lng)));
