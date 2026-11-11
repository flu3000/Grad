/**
 * Locais de grandes eventos (shows, jogos, feiras, desfiles): nos dias de evento o número de BOs dispara e não
 * representa o perigo do dia a dia. Lista curada; centro aproximado do local e raio em metros. Por enquanto só
 * entra no relatório da geocodificação (dias com BOs muito acima da mediana do ponto); o tratamento no mapa é
 * uma decisão pendente.
 */
export interface LocalDeEvento {
  nome: string;
  lat: number;
  lng: number;
  raioM: number;
}

export const LOCAIS_DE_EVENTO: LocalDeEvento[] = [
  { nome: 'Autódromo de Interlagos', lat: -23.7016, lng: -46.697, raioM: 700 },
  { nome: 'Estádio do Morumbis', lat: -23.6003, lng: -46.7203, raioM: 300 },
  { nome: 'Neo Química Arena', lat: -23.5453, lng: -46.4741, raioM: 300 },
  { nome: 'Allianz Parque', lat: -23.5275, lng: -46.6785, raioM: 250 },
  { nome: 'Estádio do Pacaembu', lat: -23.5476, lng: -46.6651, raioM: 250 },
  { nome: 'Anhembi / Sambódromo', lat: -23.516, lng: -46.637, raioM: 500 },
  { nome: 'Memorial da América Latina / Espaço das Américas', lat: -23.527, lng: -46.6668, raioM: 300 },
  { nome: 'Parque Ibirapuera', lat: -23.5874, lng: -46.6576, raioM: 800 },
  { nome: 'Expo Center Norte', lat: -23.5125, lng: -46.6135, raioM: 300 },
  { nome: 'São Paulo Expo', lat: -23.6478, lng: -46.6207, raioM: 300 },
  { nome: 'Parque Villa-Lobos', lat: -23.5466, lng: -46.724, raioM: 500 },
  { nome: 'Estádio do Canindé', lat: -23.5225, lng: -46.6205, raioM: 250 },
  { nome: 'Jockey Club de São Paulo', lat: -23.586, lng: -46.6985, raioM: 400 },
  { nome: 'Transamerica Expo / Vibra São Paulo', lat: -23.6508, lng: -46.7206, raioM: 350 },
  { nome: 'Avenida Paulista (MASP)', lat: -23.5614, lng: -46.6559, raioM: 400 },
];
