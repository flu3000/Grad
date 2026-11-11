import assert from 'node:assert/strict';
import { test } from 'node:test';
import { analisarLogradouro, distanciaEdicao, normalizarNome, normalizarTipo, numerosPorExtenso, tokens } from '../src/lib/endereco';
import { Geocodificador, VERSAO_INDICE, type IndiceCnefe, type Instancia } from '../src/lib/geocodificador';

/** Forma do CNEFE (tipo, título e nome separados) → mesma chave da SSP. */
const cnefe = (tipo: string, titulo: string, nome: string) => ({ tipo: normalizarTipo(tipo), ...normalizarNome(tokens(`${titulo} ${nome}`)) });

test('normalização: tipo, partículas e acento', () => {
  const a = analisarLogradouro('Rua Glicério');
  const b = analisarLogradouro('RUA DO GLICERIO');
  assert.equal(a.tipo, 'RUA');
  assert.equal(a.chave, 'GLICERIO');
  assert.equal(b.chave, a.chave);
  assert.equal(cnefe('RUA', '', 'DO GLICERIO').chave, a.chave);
  const av = analisarLogradouro('AV. CRUZEIRO DO SUL');
  assert.equal(av.tipo, 'AVENIDA');
  assert.equal(av.chave, 'CRUZEIRO SUL');
  assert.deepEqual(cnefe('AVENIDA', '', 'CRUZEIRO DO SUL'), { tipo: 'AVENIDA', completo: 'CRUZEIRO SUL', chave: 'CRUZEIRO SUL' });
  for (const [t, esperado] of [
    ['R X', 'RUA'],
    ['AL X', 'ALAMEDA'],
    ['TV X', 'TRAVESSA'],
    ['PÇA X', 'PRACA'],
    ['PC X', 'PRACA'],
    ['PRAÇA X', 'PRACA'],
    ['EST X', 'ESTRADA'],
    ['VD X', 'VIADUTO'],
    ['LG X', 'LARGO'],
    ['PQ X', 'PARQUE'],
    ['ROD X', 'RODOVIA'],
  ])
    assert.equal(analisarLogradouro(t).tipo, esperado, t);
});

test('normalização: títulos abreviados, com e sem título', () => {
  const ssp = analisarLogradouro('R. DR. ARNALDO');
  const ibge = cnefe('RUA', 'DOUTOR', 'ARNALDO');
  assert.equal(ssp.completo, 'DOUTOR ARNALDO');
  assert.equal(ssp.completo, ibge.completo);
  assert.equal(ssp.chave, 'ARNALDO');
  assert.equal(analisarLogradouro('RUA ARNALDO').chave, ibge.chave); // a SSP sem o título
  assert.equal(analisarLogradouro('AV PROF. FRANCISCO MORATO').chave, cnefe('AVENIDA', 'PROFESSOR', 'FRANCISCO MORATO').chave);
  assert.equal(analisarLogradouro('RUA CEL. OSCAR PORTO').completo, 'CORONEL OSCAR PORTO');
  assert.equal(analisarLogradouro('AV. GAL. ATALIBA LEONEL').completo, 'GENERAL ATALIBA LEONEL');
  assert.equal(analisarLogradouro('RUA STA. IFIGENIA').chave, cnefe('RUA', 'SANTA', 'IFIGENIA').chave);
  assert.equal(analisarLogradouro('PCA. S. BENTO').completo, 'SAO BENTO');
  assert.equal(analisarLogradouro('RUA SÃO BENTO').chave, 'BENTO');
  assert.equal(analisarLogradouro('RUA PE. ANTONIO VIEIRA').completo, 'PADRE ANTONIO VIEIRA');
  assert.equal(analisarLogradouro('AV. ENG. ARMANDO DE ARRUDA PEREIRA').completo, 'ENGENHEIRO ARMANDO ARRUDA PEREIRA');
  assert.equal(analisarLogradouro('AV MAL TITO').completo, 'MARECHAL TITO');
  assert.equal(analisarLogradouro('RUA N. SRA. DO O').chave, 'O');
  assert.equal(analisarLogradouro('RUA STO AMARO').completo, 'SANTO AMARO');
  assert.equal(analisarLogradouro('AVENIDA SANTO AMARO').chave, 'AMARO');
});

test('normalização: números por extenso', () => {
  assert.deepEqual(numerosPorExtenso(['VINTE', 'E', 'CINCO', 'DE', 'MARCO']), ['25', 'DE', 'MARCO']);
  assert.deepEqual(numerosPorExtenso(['NOVE', 'DE', 'JULHO']), ['9', 'DE', 'JULHO']);
  assert.deepEqual(numerosPorExtenso(['MIL', 'NOVECENTOS', 'E', 'TRINTA', 'E', 'DOIS']), ['1932']);
  assert.deepEqual(numerosPorExtenso(['ORDEM', 'E', 'PROGRESSO']), ['ORDEM', 'E', 'PROGRESSO']);
  const v = analisarLogradouro('Viaduto Vinte e Cinco de Março');
  assert.equal(v.tipo, 'VIADUTO');
  assert.equal(v.chave, '25 MARCO');
  assert.equal(analisarLogradouro('RUA 25 DE MARÇO').chave, '25 MARCO');
  assert.equal(analisarLogradouro('RUA VINTE E CINCO DE MARÇO, 641').chave, '25 MARCO');
  assert.equal(analisarLogradouro('RUA 1º DE MAIO').chave, '1 MAIO');
  assert.equal(analisarLogradouro('RUA PRIMEIRO DE MAIO').chave, '1 MAIO');
});

test('normalização: complementos e número embutido', () => {
  const a = analisarLogradouro('AVENIDA PAULISTA, 2100');
  assert.equal(a.chave, 'PAULISTA');
  assert.equal(a.numero, 2100);
  assert.equal(analisarLogradouro('RUA AUGUSTA, 1500 APTO 12').numero, 1500);
  assert.equal(analisarLogradouro('RUA AUGUSTA Nº 1500').numero, 1500);
  assert.equal(analisarLogradouro('RUA AUGUSTA Nº 1500').chave, 'AUGUSTA');
  assert.equal(analisarLogradouro('RUA AUGUSTA APTO 12 BLOCO B').chave, 'AUGUSTA');
  assert.equal(analisarLogradouro('RUA AUGUSTA LOJA 3').chave, 'AUGUSTA');
  assert.equal(analisarLogradouro('RUA AUGUSTA FUNDOS').chave, 'AUGUSTA');
  assert.equal(analisarLogradouro('RUA AUGUSTA ESQ COM RUA X').chave, 'AUGUSTA');
  const sn = analisarLogradouro('AVENIDA WASHINGTON LUÍS, S/N');
  assert.equal(sn.numero, null);
  assert.equal(sn.semNumero, true);
  assert.equal(analisarLogradouro('AVENIDA ALBERT EINSTEIN, 627/665/701').numero, 627);
  assert.equal(analisarLogradouro('AVENIDA ARICANDUVA - PISTA CENTRAL').chave, 'ARICANDUVA');
  assert.equal(analisarLogradouro('RODOVIA PRESIDENTE DUTRA (BR 116)').chave, 'DUTRA');
  assert.equal(analisarLogradouro('AVENIDA JACU-PÊSSEGO').chave, 'JACU PESSEGO');
  assert.equal(analisarLogradouro('RUA: AUGUSTA').chave, 'AUGUSTA');
  assert.equal(analisarLogradouro('RUA CASA VERDE').chave, 'CASA VERDE'); // "CASA" no começo é nome, não complemento
});

test('distância de edição com limite', () => {
  assert.equal(distanciaEdicao('GLICERIO', 'GLISERIO', 2), 1);
  assert.equal(distanciaEdicao('PAULISTA', 'PAULISTANA', 2), 2);
  assert.equal(distanciaEdicao('PAULISTA', 'AUGUSTA', 1), 2); // passou do limite
});

// ------------------------------------------------------------------------------------------ busca

const inst = (o: Partial<Instancia> & Pick<Instancia, 't' | 'c' | 'k'>): Instancia => ({ d: ['SE'], l: [], x: 2000, m: [-23_550_000, -46_630_000], n: [], la: [], ln: [], ...o });
// Rua com números 100..200 pares e ímpares, latitude crescendo 10 µ° por número.
const nums = [100, 101, 102, 104, 110, 151, 200, 260, 420];
const indice: IndiceCnefe = {
  versao: VERSAO_INDICE,
  fonte: { arquivo: 'teste', bytes: 0, linhas: 0 },
  contagens: {},
  localidades: { 'JARDIM X': 'MOOCA' },
  vizinhos: { SE: ['REPUBLICA'], REPUBLICA: ['SE'], MOOCA: ['BRAS'], BRAS: ['MOOCA'] },
  instancias: [
    inst({ t: 'RUA', c: 'GLICERIO', k: 'GLICERIO', n: nums, la: nums.map((x) => -23_550_000 + x * 10), ln: nums.map(() => -46_630_000) }),
    inst({ t: 'RUA', c: '1', k: '1', d: ['SE'], x: 300, m: [-23_551_000, -46_631_000] }),
    inst({ t: 'RUA', c: '1', k: '1', d: ['MOOCA'], l: ['JARDIM X'], x: 300, m: [-23_560_000, -46_600_000] }),
    inst({ t: 'RUA', c: 'DOUTOR PEDRO', k: 'PEDRO', d: ['SE'], x: 300 }),
    inst({ t: 'RUA', c: 'PADRE PEDRO', k: 'PEDRO', d: ['SE'], x: 300, m: [-23_552_000, -46_632_000] }),
  ],
};
const g = new Geocodificador(indice);
const q = (logradouro: string, numero: number | null, distrito: string | null = 'SE', bairro: string | null = null) => g.geocodificar({ logradouro, numero, bairro, distrito });

test('busca: exato, interpolado (mesmo lado), vizinho, curto', () => {
  assert.equal(q('RUA DO GLICÉRIO', 102).nivel, 'exato');
  const i = q('RUA GLICERIO', 106); // entre 104 e 110 (pares)
  assert.equal(i.nivel, 'interpolado');
  assert.equal(i.lados, 2);
  assert.ok(Math.abs(i.lat! - (-23.55 + 106 * 1e-5)) < 1e-9);
  assert.equal(q('RUA GLICERIO', 103).nivel, 'interpolado'); // entre 101 e 151 (ímpares)
  assert.equal(q('RUA GLICERIO', 240).nivel, 'interpolado'); // entre 200 e 260
  assert.equal(q('RUA GLICERIO', 300).lados, 2); // 260 e 420: 160 números entre eles
  assert.equal(q('RUA GLICERIO', 430).lados, 1); // só o 420 (a 10 números) do mesmo lado
  assert.equal(q('RUA GLICERIO', 600).falha, 'numero_fora_do_logradouro'); // 420 a 180 números e logradouro longo
  assert.equal(q('RUA GLICERIO', null).falha, 'sem_numero_logradouro_longo');
  assert.equal(q('RUA DOUTOR PEDRO', null).nivel, 'curto');
});

test('busca: homônimos pelo distrito, pelo bairro e ambíguos', () => {
  assert.ok(Math.abs(q('RUA UM', 5, 'SE').lat! - -23.551) < 1e-9);
  assert.ok(Math.abs(q('RUA UM', 5, 'MOOCA').lat! - -23.56) < 1e-9);
  assert.ok(Math.abs(q('RUA UM', 5, 'BRAS').lat! - -23.56) < 1e-9); // distrito vizinho
  assert.equal(q('RUA UM', 5, 'PINHEIROS').falha, 'fora_do_distrito');
  assert.equal(q('RUA UM', 5, null).falha, 'ambiguo');
  assert.equal(q('RUA UM', 5, null, 'JD X').nivel, 'curto'); // BAIRRO → localidade → distrito
  // mesmo nome com títulos diferentes: o título da SSP desempata; sem título, ambíguo
  assert.ok(Math.abs(q('RUA PE PEDRO', null).lat! - -23.552) < 1e-9);
  assert.equal(q('RUA PEDRO', null).falha, 'ambiguo');
});

test('busca: aproximado só com distrito', () => {
  const r = q('RUA GLISERIO', 102);
  assert.equal(r.nivel, 'exato_aproximado');
  assert.equal(q('RUA GLISERIO', 102, null).falha, 'aproximado_sem_distrito');
  assert.equal(q('RUA GLISERIO', 102, 'MOOCA').falha, 'logradouro_nao_encontrado'); // só existe longe
});

test('busca: o mesmo logradouro partido em duas instâncias fica com a que tem o número', () => {
  const ns1 = [10, 12, 14];
  const ns2 = [900, 902, 904];
  const g2 = new Geocodificador({
    ...indice,
    instancias: [
      inst({ t: 'AVENIDA', c: 'NACOES UNIDAS', k: 'NACOES UNIDAS', n: ns1, la: ns1.map(() => -23_600_000), ln: ns1.map(() => -46_700_000) }),
      inst({ t: 'AVENIDA', c: 'NACOES UNIDAS', k: 'NACOES UNIDAS', n: ns2, la: ns2.map(() => -23_500_000), ln: ns2.map(() => -46_700_000) }),
    ],
  });
  const r = g2.geocodificar({ logradouro: 'AV DAS NAÇÕES UNIDAS', numero: 902, bairro: null, distrito: 'SE' });
  assert.equal(r.nivel, 'exato');
  assert.ok(Math.abs(r.lat! - -23.5) < 1e-9);
  assert.equal(g2.geocodificar({ logradouro: 'AV DAS NAÇÕES UNIDAS', numero: 500, bairro: null, distrito: 'SE' }).falha, 'ambiguo');
});
