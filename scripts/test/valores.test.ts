import assert from 'node:assert/strict';
import { test } from 'node:test';
import { codigoIbge, coordenada, data, ehNomeDaCapital, ehNulo, ehSigilo, hora, numeroLogradouro, texto } from '../src/lib/valores';

test('coordenada: número, texto com vírgula, traço, zero e NULL', () => {
  assert.deepEqual(coordenada(-23.5582629), { valor: -23.5582629, formato: 'numero' });
  assert.deepEqual(coordenada('-23,5582629'), { valor: -23.5582629, formato: 'texto_virgula' });
  assert.deepEqual(coordenada('-46.63'), { valor: -46.63, formato: 'texto_ponto' });
  assert.deepEqual(coordenada('-'), { valor: null, formato: 'nulo' });
  assert.deepEqual(coordenada('NULL'), { valor: null, formato: 'nulo' });
  assert.deepEqual(coordenada(0), { valor: null, formato: 'zero' });
  assert.deepEqual(coordenada('0'), { valor: null, formato: 'zero' });
  assert.deepEqual(coordenada(null), { valor: null, formato: 'nulo' });
  assert.deepEqual(coordenada('abc'), { valor: null, formato: 'invalido' });
  assert.deepEqual(coordenada({ formula: 'X', result: -23.5 }), { valor: -23.5, formato: 'numero' });
});

test('data: serial do Excel, Date, ISO e DD/MM/AAAA', () => {
  assert.deepEqual(data(46027), { valor: '2026-01-05', formato: 'serial' }); // BO TB7197, registro 05/01/2026
  assert.deepEqual(data(46027.75), { valor: '2026-01-05', formato: 'serial' });
  assert.deepEqual(data(new Date(Date.UTC(2025, 0, 2))), { valor: '2025-01-02', formato: 'date' });
  assert.deepEqual(data('2024-12-31 00:00:00'), { valor: '2024-12-31', formato: 'iso' });
  assert.deepEqual(data('5/1/2026'), { valor: '2026-01-05', formato: 'br' });
  assert.deepEqual(data('NULL'), { valor: null, formato: 'nulo' });
  assert.deepEqual(data(12), { valor: null, formato: 'invalido' });
});

test('hora: fração do dia, segundos, texto, Date e NULL', () => {
  assert.deepEqual(hora(0.625), { valor: { h: 15, m: 0, s: 0 }, formato: 'fracao' });
  assert.deepEqual(hora(0.8752199074074074), { valor: { h: 21, m: 0, s: 19 }, formato: 'fracao' });
  assert.deepEqual(hora(0.9965277777777778), { valor: { h: 23, m: 55, s: 0 }, formato: 'fracao' });
  assert.deepEqual(hora(0), { valor: { h: 0, m: 0, s: 0 }, formato: 'fracao' });
  assert.deepEqual(hora('02:50:30'), { valor: { h: 2, m: 50, s: 30 }, formato: 'texto_hms' });
  assert.deepEqual(hora('18:00'), { valor: { h: 18, m: 0, s: 0 }, formato: 'texto_hm' });
  assert.deepEqual(hora(new Date('1899-12-30T18:00:00Z')), { valor: { h: 18, m: 0, s: 0 }, formato: 'date' });
  assert.deepEqual(hora(46027.5), { valor: { h: 12, m: 0, s: 0 }, formato: 'serial_com_hora' });
  assert.deepEqual(hora('NULL'), { valor: null, formato: 'nulo' });
  assert.deepEqual(hora(''), { valor: null, formato: 'nulo' });
  assert.deepEqual(hora('25:00'), { valor: null, formato: 'invalido' });
});

test('textos nulos, sigilo, número do logradouro, município', () => {
  assert.equal(ehNulo('NULL'), true);
  assert.equal(ehNulo(' - '), true);
  assert.equal(texto('  Rua   Glicério '), 'Rua Glicério');
  assert.equal(texto('NULL'), null);
  assert.equal(ehSigilo('VEDAÇÃO DA DIVULGAÇÃO DOS DADOS RELATIVOS'), true);
  assert.equal(ehSigilo('Rua Glicério'), false);
  assert.equal(numeroLogradouro(818), 818);
  assert.equal(numeroLogradouro(0), null);
  assert.equal(numeroLogradouro('S/N'), null);
  assert.equal(numeroLogradouro('120A'), 120); // letra do complemento é descartada
  assert.equal(codigoIbge(3550308), 3550308);
  assert.equal(codigoIbge('3550308'), 3550308);
  assert.equal(codigoIbge('NULL'), null);
  assert.equal(ehNomeDaCapital('S.PAULO'), true);
  assert.equal(ehNomeDaCapital('São Paulo'), true);
  assert.equal(ehNomeDaCapital('S.BERNARDO DO CAMPO'), false);
});
