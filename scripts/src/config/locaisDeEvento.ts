/**
 * Locais de grandes eventos (shows, jogos, feiras, desfiles, Carnaval de rua): nos dias de evento o número de BOs
 * dispara. Os registros continuam no mapa e na nota (são reais); o relatório do endereço só avisa quando a área
 * de 500 m inclui um destes locais ("X% dos registros deste local aconteceram em Y dias de evento em 2025").
 * A tabela `event_venues` (por local e ano) sai da consolidação (`npm run data:consolidar`).
 *
 * Centro e raio revisados em 11/11/2026 pelos picos diários dos BOs (hexágonos res 9 com dias muito acima da média):
 *   - corrigidos: Interlagos e Morumbis (centro), Canindé (centro e raio 300 m), Anhembi (centro no Sambódromo,
 *     raio 500 m; o Carnaval no Sambódromo não forma pico, os picos são de outros eventos), Paulista (raio 500 m),
 *     Memorial (centro);
 *   - novos: Centro (República/Anhangabaú: Carnaval de rua e Virada Cultural) e Barra Funda (blocos de Carnaval);
 *   - retirados (sem pico ou quase nenhum): Pacaembu, São Paulo Expo, Villa-Lobos, Jockey Club,
 *     Transamerica Expo / Vibra São Paulo, Espaço das Américas e Memorial da América Latina (com os BOs do Terminal
 *     Barra Funda, que fica no raio, a mediana diária sobe e os picos somem).
 */
export interface LocalDeEvento {
  nome: string;
  lat: number;
  lng: number;
  raioM: number;
}

/**
 * Dia de pico: dia com BOs no raio ≥ max(`minimo`, `vezesMediana` × mediana diária do local no ano). A mediana é
 * de todos os dias do ano com dados (dias sem BO contam como zero).
 */
export const DIA_DE_PICO = { minimo: 10, vezesMediana: 5 };

/** Um local só fica na lista com pelo menos `minDias` dias de pico e `minPct`% dos BOs nesses dias (2023–2026). */
export const MANTER_LOCAL = { minDias: 3, minPct: 5 };

export const LOCAIS_DE_EVENTO: LocalDeEvento[] = [
  { nome: 'Autódromo de Interlagos', lat: -23.7035, lng: -46.6985, raioM: 700 },
  { nome: 'Estádio do Morumbis', lat: -23.5997, lng: -46.7192, raioM: 300 },
  { nome: 'Neo Química Arena', lat: -23.546, lng: -46.4735, raioM: 300 },
  { nome: 'Allianz Parque', lat: -23.5275, lng: -46.6785, raioM: 250 },
  { nome: 'Estádio do Canindé', lat: -23.524, lng: -46.6195, raioM: 300 },
  { nome: 'Anhembi / Sambódromo', lat: -23.516, lng: -46.643, raioM: 500 },
  { nome: 'Parque Ibirapuera', lat: -23.5874, lng: -46.6576, raioM: 800 },
  { nome: 'Expo Center Norte', lat: -23.5125, lng: -46.6135, raioM: 300 },
  { nome: 'Avenida Paulista', lat: -23.56, lng: -46.658, raioM: 500 },
  { nome: 'Centro (República / Anhangabaú)', lat: -23.5445, lng: -46.6415, raioM: 400 },
  { nome: 'Barra Funda (blocos de Carnaval)', lat: -23.522, lng: -46.661, raioM: 300 },
];
