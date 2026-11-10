import assert from 'node:assert/strict';
import { test } from 'node:test';
import { classifyCrime, maisGrave } from '../src/config/crimeWeights';
import { naoGeocodificar } from '../src/config/naoGeocodificar';

test('Tema 506 do STF vai para não criminal; porte para consumo continua em outros', () => {
  assert.equal(classifyCrime('Ilícito extrapenal (Tema 506 STF)', 'PORTE DE ENTORPECENTES'), 'nao_criminal');
  assert.equal(classifyCrime('ILICITO EXTRAPENAL (TEMA 506 STF)', 'APREENSÃO DE ENTORPECENTES'), 'nao_criminal');
  assert.equal(classifyCrime('Ilícito extra-penal - Tema 506', ''), 'nao_criminal');
  assert.equal(
    classifyCrime('Drogas para consumo pessoal sem autorização ou em desacordo (Art.28,caput)', 'PORTE DE ENTORPECENTES'),
    'outros',
  );
  assert.equal(classifyCrime('Furto (art. 155)', 'FURTO - OUTROS'), 'furto_outros');
});

test('categoria mais grave: maior peso e, no empate, a ordem das regras', () => {
  assert.equal(maisGrave(['furto_outros', 'lesao_dolosa']), 'lesao_dolosa');
  assert.equal(maisGrave(['lesao_dolosa', 'roubo_outros']), 'roubo_outros');
  assert.equal(maisGrave(['outros', 'trafico']), 'trafico');
  assert.equal(maisGrave(['estupro', 'lesao_dolosa']), 'estupro');
  assert.equal(maisGrave(['homicidio_doloso', 'latrocinio']), 'latrocinio'); // ambos 10: latrocínio vem antes nas regras
  assert.equal(maisGrave(['latrocinio', 'homicidio_doloso']), 'latrocinio');
  assert.equal(maisGrave(['nao_criminal', 'culposo']), 'nao_criminal'); // ambos 0: não criminal vem antes
  assert.equal(maisGrave(['outros']), 'outros');
});

test('lista do que nunca geocodificar', () => {
  assert.equal(naoGeocodificar('furto_outros', 'Furto (art. 155)', 'Transeunte', 'FURTO - OUTROS', 'Rua Glicério'), false);
  assert.equal(naoGeocodificar('furto_outros', 'Furto', null, 'FURTO - OUTROS', 'VEDAÇÃO DA DIVULGAÇÃO DOS DADOS RELATIVOS'), true);
  assert.equal(naoGeocodificar('estupro', 'Estupro', null, 'ESTUPRO', 'Rua X'), true);
  assert.equal(naoGeocodificar('lesao_dolosa', 'Lesão corporal (art. 129)', 'Violência doméstica', 'LESÃO CORPORAL DOLOSA', 'Rua X'), true);
  assert.equal(naoGeocodificar('lesao_dolosa', 'Lesão corporal - Lei 11.340/06', null, '', 'Rua X'), true);
  assert.equal(naoGeocodificar('outros', 'Abandono de incapaz (art. 133)', null, '', 'Rua X'), true);
  assert.equal(naoGeocodificar('outros', 'Importunação sexual (art. 215-A)', null, '', 'Rua X'), true);
  assert.equal(naoGeocodificar('roubo_outros', 'Roubo (art. 157)', 'Transeunte', 'ROUBO - OUTROS', 'Avenida Paulista'), false);
});
