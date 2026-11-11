import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ehCabecalhoDeDados, mapearCabecalho, normalizarNomeColuna } from '../src/lib/colunas';
import { anoDaPlanilha } from '../src/lib/planilhas';
import { periodoDaHora, periodoDoTexto } from '../src/lib/horario';

test('normaliza nomes de coluna', () => {
  assert.equal(normalizarNomeColuna('COD IBGE'), 'COD_IBGE');
  assert.equal(normalizarNomeColuna('NOME_MUNICIPIO_CIRCUNCRIÇÃO'), 'NOME_MUNICIPIO_CIRCUNCRICAO');
});

test('aliases: formato 2026, formato 2023/2024 e formato antigo de 2025', () => {
  // row.values do exceljs começa no índice 1
  const c2026 = mapearCabecalho([undefined, 'NUM_BO', 'LATITUDE', 'LONGITUDE', 'RUBRICA', 'NATUREZA_APURADA', 'COD IBGE', 'NOME_MUNICIPIO_CIRCUNSCRICAO']);
  assert.equal(c2026.indice.cod_ibge, 6);
  assert.equal(c2026.indice.municipio_circunscricao, 7);
  assert.equal(ehCabecalhoDeDados(c2026), true);

  const c2023 = mapearCabecalho([undefined, 'LATITUDE', 'LONGITUDE', 'RUBRICA', 'NATUREZA_APURADA', 'CD_IBGE', 'NOME_MUNICIPIO_CIRCUNCRIÇÃO']);
  assert.equal(c2023.indice.cod_ibge, 5);
  assert.equal(c2023.indice.municipio_circunscricao, 6);
  assert.ok(c2023.faltando.includes('tipo_local'));

  const c2025 = mapearCabecalho([undefined, 'LATITUDE', 'LONGITUDE', 'RUBRICA', 'NATUREZA_APURADA', 'PRECISAO', 'ENDERECO_COMPLETO', 'XYZ']);
  assert.equal(c2025.indice.precisao, 5);
  assert.equal(c2025.indice.endereco_completo, 6);
  assert.deepEqual(c2025.desconhecidas, ['XYZ']);
  assert.ok(c2025.faltando.includes('num_bo'));

  assert.equal(ehCabecalhoDeDados(mapearCabecalho([undefined, 'Campos', 'Descrição'])), false);
});

test('ano da planilha: pasta tem prioridade sobre o nome', () => {
  assert.equal(anoDaPlanilha('data/SSP-SP/SPDadosCriminais_2024.xlsx'), 2024);
  assert.equal(anoDaPlanilha('data/SSP-SP/SP_2025_Reduzida.xlsx'), 2025);
  assert.equal(anoDaPlanilha('data/SSP-SP/2023/qualquer.xlsx'), 2023);
  assert.equal(anoDaPlanilha('data/SSP-SP/semano.xlsx'), null);
});

test('período: pelo texto da SSP e pela hora', () => {
  assert.equal(periodoDoTexto('De madrugada'), 'madrugada');
  assert.equal(periodoDoTexto('Pela manhã'), 'manha');
  assert.equal(periodoDoTexto('A tarde'), 'tarde');
  assert.equal(periodoDoTexto('A noite'), 'noite');
  assert.equal(periodoDoTexto('Em hora incerta'), 'incerta');
  assert.equal(periodoDoTexto('NULL'), null);
  assert.equal(periodoDoTexto(null), null);
  assert.deepEqual([0, 5, 6, 11, 12, 17, 18, 23].map((h) => periodoDaHora(h)), ['madrugada', 'madrugada', 'manha', 'manha', 'tarde', 'tarde', 'noite', 'noite']);
});
