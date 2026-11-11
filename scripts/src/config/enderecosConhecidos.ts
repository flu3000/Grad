/**
 * Endereços conhecidos (estações, terminais, estádios, shoppings) com muitos BOs só com endereço, em que a
 * geocodificação comum falha ou cai longe: o logradouro é longo e não tem número (estação), o CNEFE não tem o
 * número, ou a interpolação erra (o Autódromo caía 3 km ao sul).
 *
 * Origem das coordenadas: mediana dos pontos confiáveis da SSP (com 4+ casas decimais, fora dos pontos padrão)
 * dos BOs com o mesmo endereço e bairro, em 2023–2026, só quando o grupo é compacto (≥ 80% a menos de 300 m da
 * mediana, pelo menos 10 pontos). Ficaram de fora os endereços em que números diferentes recebem exatamente a mesma
 * coordenada da SSP (sinal de que ela também é aproximada), como "Av. Otaviano Alves de Lima, 1824 / 2758".
 * Levantamento de 11/11/2026 (`BOs` = BOs sem coordenada com esse endereço nos 4 anos; `dist` = distância da
 * geocodificação comum até a referência).
 *
 * `logradouro` é o tipo + nome normalizados (analisarLogradouro), `numero` null = sem número, e `bairros` (BAIRRO
 * normalizado) restringe os endereços sem número, que se repetem em vários lugares da mesma avenida.
 */
export interface EnderecoConhecido {
  nome: string;
  logradouro: string;
  numero: number | null;
  bairros?: string[];
  lat: number;
  lng: number;
  origem: string;
}

const ssp = (pontos: number, compacto: number, bos: number, comum: string) =>
  `mediana de ${pontos} pontos confiáveis da SSP (${compacto}% a < 300 m); ${bos} BOs sem coordenada; geocodificação comum: ${comum}`;

export const ENDERECOS_CONHECIDOS: EnderecoConhecido[] = [
  // ------------------------------------------------------------------ estações e terminais (BOs "Metroviário e Ferroviário")
  { nome: 'Terminal Barra Funda', logradouro: 'AVENIDA MARIO ANDRADE', numero: null, bairros: ['BARRA FUNDA'], lat: -23.526671, lng: -46.667188, origem: ssp(37, 89, 7674, 'centro do logradouro, 456 m') },
  { nome: 'Estação na Rua Brigadeiro Tobias (região da Luz)', logradouro: 'RUA BRIGADEIRO TOBIAS', numero: null, bairros: ['SE'], lat: -23.538473, lng: -46.635013, origem: ssp(29, 90, 2461, 'centro do logradouro, 180 m') },
  { nome: 'Estação Santa Cruz (Rua Domingos de Morais)', logradouro: 'RUA DOMINGOS MORAIS', numero: null, bairros: ['VILA MARIANA'], lat: -23.59852, lng: -46.63666, origem: ssp(131, 88, 1770, 'logradouro longo, sem ponto') },
  { nome: 'Terminal Santo Amaro (Av. Padre José Maria)', logradouro: 'AVENIDA PADRE JOSE MARIA', numero: null, bairros: ['SANTO AMARO'], lat: -23.65419, lng: -46.713153, origem: ssp(23, 91, 1330, 'logradouro longo, sem ponto') },
  { nome: 'Estação Lapa (Rua William Speers)', logradouro: 'RUA WILLIAM SPEERS', numero: null, bairros: ['LAPA DE BAIXO'], lat: -23.517785, lng: -46.703023, origem: ssp(16, 94, 1184, 'logradouro longo, sem ponto') },
  { nome: 'Estação Anhangabaú (Rua Formosa)', logradouro: 'RUA FORMOSA', numero: null, bairros: ['SE'], lat: -23.5453, lng: -46.637047, origem: ssp(23, 96, 762, 'centro do logradouro, 285 m') },
  { nome: 'Estação Butantã (Av. Vital Brasil)', logradouro: 'AVENIDA VITAL BRASIL', numero: null, bairros: ['BUTANTA'], lat: -23.571502, lng: -46.708175, origem: ssp(32, 81, 737, 'centro do logradouro, 157 m') },
  { nome: 'Estação Ipiranga (Rua Bom Pastor)', logradouro: 'RUA BOM PASTOR', numero: null, bairros: ['IPIRANGA'], lat: -23.60154, lng: -46.60336, origem: ssp(57, 96, 423, 'logradouro longo, sem ponto') },
  { nome: 'Viaduto Vinte e Cinco de Março (estação)', logradouro: 'VIADUTO 25 MARCO', numero: null, bairros: ['SE'], lat: -23.549052, lng: -46.627389, origem: ssp(18, 100, 365, 'logradouro longo, sem ponto') },
  { nome: 'Estação Liberdade / São Joaquim (Av. da Liberdade)', logradouro: 'AVENIDA LIBERDADE', numero: null, bairros: ['LIBERDADE'], lat: -23.557717, lng: -46.636696, origem: ssp(22, 86, 335, 'logradouro longo, sem ponto') },
  { nome: 'Estação Lapa (Rua João Tibiriçá)', logradouro: 'RUA JOAO TIBIRICA', numero: null, bairros: ['LAPA'], lat: -23.51931, lng: -46.721574, origem: ssp(65, 85, 239, 'logradouro longo, sem ponto') },
  { nome: 'Aeroporto de Congonhas', logradouro: 'AVENIDA WASHINGTON LUIS', numero: null, bairros: ['VILA CONGONHAS'], lat: -23.625728, lng: -46.660425, origem: ssp(141, 82, 389, 'logradouro longo, sem ponto') },

  // ------------------------------------------------------------------------------------------- locais de evento
  { nome: 'Autódromo de Interlagos', logradouro: 'AVENIDA SENADOR TEOTONIO VILELA', numero: 261, lat: -23.703657, lng: -46.700989, origem: ssp(500, 94, 95, 'interpolação, 3,2 km ao sul') },
  { nome: 'Anhembi / Sambódromo', logradouro: 'AVENIDA OLAVO FONTOURA', numero: 1209, lat: -23.515256, lng: -46.642086, origem: ssp(500, 93, 185, 'centro do logradouro, 511 m') },
  { nome: 'Estádio do Morumbis', logradouro: 'PRACA ROBERTO GOMES PEDROSA', numero: 1, lat: -23.598309, lng: -46.719984, origem: ssp(500, 100, 58, 'logradouro não encontrado') },
  { nome: 'Parque Ibirapuera', logradouro: 'PARQUE IBIRAPUERA', numero: 1, lat: -23.58765, lng: -46.655807, origem: ssp(35, 100, 154, 'homônimo em Cidade Dutra, 16,6 km (já rejeitado sem distrito)') },

  // ------------------------------------------------------------------------------------- shoppings e outros
  { nome: 'Shopping Aricanduva', logradouro: 'AVENIDA ARICANDUVA', numero: 5555, lat: -23.571818, lng: -46.503985, origem: ssp(213, 93, 340, 'interpolação, 2,2 km') },
  { nome: 'Shopping Morumbi', logradouro: 'AVENIDA ROQUE PETRONI JUNIOR', numero: 1089, lat: -23.621636, lng: -46.698835, origem: ssp(474, 95, 448, 'número fora do logradouro') },
  { nome: 'Av. Dr. Assis Ribeiro, 4777', logradouro: 'AVENIDA DOUTOR ASSIS RIBEIRO', numero: 4777, lat: -23.495112, lng: -46.508516, origem: ssp(39, 92, 232, 'centro de outro trecho, 2,2 km') },
  { nome: 'SP Market (Av. das Nações Unidas, 22540)', logradouro: 'AVENIDA NACOES UNIDAS', numero: 22540, lat: -23.676037, lng: -46.699475, origem: ssp(129, 95, 174, 'número exato do CNEFE, 1,2 km') },
  { nome: 'Edifício Copan (Av. Ipiranga, 200)', logradouro: 'AVENIDA IPIRANGA', numero: 200, lat: -23.543312, lng: -46.641559, origem: ssp(272, 94, 134, 'número exato do CNEFE, 473 m') },
  { nome: 'Shopping Eldorado (Av. Rebouças, 3970)', logradouro: 'AVENIDA REBOUCAS', numero: 3970, lat: -23.574237, lng: -46.69676, origem: ssp(500, 92, 100, 'número exato do CNEFE, 157 m') },
  { nome: "Praça Miguel Dell'Erba, 50", logradouro: 'PRACA MIGUEL DELLERBA', numero: 50, lat: -23.520114, lng: -46.70009, origem: ssp(57, 100, 69, 'nome não encontrado (sem distrito)') },
  { nome: 'Av. Luiz Dumont Villares, 579', logradouro: 'AVENIDA LUIZ DUMONT VILLARES', numero: 579, lat: -23.494963, lng: -46.611872, origem: ssp(12, 100, 52, 'número fora do logradouro') },
  { nome: 'Praça da República, 53', logradouro: 'PRACA REPUBLICA', numero: 53, lat: -23.542699, lng: -46.641631, origem: ssp(59, 97, 50, 'número exato do CNEFE, 225 m') },
];
