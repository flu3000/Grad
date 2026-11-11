/**
 * Testes das funções puras do app (sem React Native). Rodam com o tsx do pacote scripts: `npm test` na raiz.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { anoDoDataset, anoPadrao, notaHora, notaPeriodo, ordenarAnos } from '../src/lib/anosDados';
import {
  distancia,
  intervaloDeMeses,
  numero,
  porcentagem,
  proporcao,
  quantidade,
  rotuloAno,
  rotuloFonte,
  textoPercentil,
} from '../src/lib/formatacao';
import {
  ErroRelatorio,
  categoriasDoRelatorio,
  fraseDiaNoite,
  fraseMesmoPeriodo,
  validarRelatorio,
} from '../src/lib/relatorioDados';
import { janelaDaHora, periodoAtual, periodoDaHora, rotuloPeriodo } from '../src/lib/tempo';

describe('tempo', () => {
  it('período pela hora', () => {
    assert.deepEqual([0, 5, 6, 11, 12, 17, 18, 23].map(periodoDaHora), [0, 0, 1, 1, 2, 2, 3, 3]);
    assert.equal(periodoAtual(new Date(2026, 10, 11, 19, 30)), 3);
  });
  it('rótulos', () => {
    assert.equal(rotuloPeriodo(3), 'Noite · 18h–24h');
    assert.equal(rotuloPeriodo(0), 'Madrugada · 0h–6h');
    assert.equal(janelaDaHora(19), '18h–21h');
    assert.equal(janelaDaHora(0), '23h–2h');
    assert.equal(janelaDaHora(22), '21h–24h');
    assert.equal(janelaDaHora(23), '22h–1h');
  });
});

describe('formatação', () => {
  it('números', () => {
    assert.equal(numero(1552), '1.552');
    assert.equal(numero(373639), '373.639');
    assert.equal(numero(1.84, 1), '1,8');
    assert.equal(numero(-1234.5, 1), '-1.234,5');
    assert.equal(numero(-0.01, 1), '0,0');
  });
  it('distância', () => {
    assert.equal(distancia(335), '340 m');
    assert.equal(distancia(1234), '1,2 km');
    assert.equal(distancia(12_500), '13 km');
  });
  it('percentil', () => {
    assert.equal(textoPercentil(92.3), 'Mais registros que 92% das áreas da cidade');
    assert.equal(textoPercentil(99.7), 'Entre as áreas com mais registros da cidade');
    assert.equal(textoPercentil(0), 'Entre as áreas com menos registros da cidade');
  });
  it('proporção e porcentagem', () => {
    assert.equal(proporcao(67.7), 'cerca de 2/3');
    assert.equal(proporcao(48.5), 'cerca de metade');
    assert.equal(proporcao(41), '4 em cada 10');
    assert.equal(porcentagem(0.51), '0,5%');
    assert.equal(porcentagem(18.9), '19%');
  });
  it('anos e fonte', () => {
    assert.equal(intervaloDeMeses(8), 'jan–ago');
    assert.equal(rotuloAno({ ano: 2026, completo: false, ultimoMes: 8 }), '2026 (jan–ago)');
    assert.equal(rotuloAno({ ano: 2025, completo: true, ultimoMes: 12 }), '2025');
    assert.equal(rotuloFonte({ ano: 2026, completo: false, ultimoMes: 8 }), 'SSP-SP, jan–ago 2026');
    assert.equal(rotuloFonte({ ano: 2025, completo: true, ultimoMes: 12 }), 'SSP-SP, 2025');
    assert.equal(quantidade('<3'), 'menos de 3');
    assert.equal(quantidade(1763), '1.763');
  });
});

describe('anos (datasets)', () => {
  const linhas = [
    { year: 2025, complete: true, last_complete_month: 12, rows_valid: 401483, rows_no_hour: 129621, period_factor: 1.00511, hidden_location: { message: 'x' } },
    { year: 2026, complete: false, last_complete_month: 8, rows_valid: 288513, rows_no_hour: 103673, period_factor: 1.00468, hidden_location: null },
    { year: 2024, complete: true, last_complete_month: 12, rows_valid: 410769, rows_no_hour: 133140, period_factor: 1.00492, hidden_location: null },
  ];
  const anos = linhas.map(anoDoDataset);
  it('ano padrão é o completo mais recente', () => {
    assert.equal(anoPadrao(anos), 2025);
    assert.deepEqual(ordenarAnos(anos).map((a) => a.ano), [2026, 2025, 2024]);
    assert.equal(anos[1].ultimoMes, 8);
  });
  it('notas da legenda', () => {
    assert.equal(notaPeriodo(anos[0]), 'Menos de 1% dos registros não informam o período e só entram no dia inteiro.');
    assert.equal(notaPeriodo({ pctSemPeriodo: 12.3 }), '12% dos registros não informam o período e só entram no dia inteiro.');
    assert.match(notaHora(anos[0]), /cerca de 2\/3/);
  });
});

// Amostra real (Av. Paulista, 2025), reduzida
const PAULISTA = {
  year: 2025,
  level: 10,
  score: 4019.3,
  total: 2283,
  months: 12,
  by_hour: [22, 22, 13, 14, 23, 24, 18, 25, 32, 38, 50, 31, 50, 64, 59, 48, 65, 85, 79, 89, 71, 59, 31, 36],
  area_km2: 0.851,
  complete: true,
  district: { id: 8583447, name: 'BELA VISTA' },
  hexagons: 8,
  radius_m: 500,
  by_period: ['madrugada', 'manha', 'tarde', 'noite'].map((period, i) => ({
    period,
    level: [8, 9, 10, 10][i],
    score: 1,
    total: [248, 407, 866, 752][i],
    top: [{ total: 191, category: 'furto_outros' }],
  })),
  day_night: { day: { level: 10, total: 1273 }, night: { level: 10, total: 1000 } },
  evolution: [
    { year: 2024, level: 10, score: 5122.4, total: 2640, months: 12, complete: true },
    { year: 2025, level: 10, score: 4019.3, total: 2283, months: 12, complete: true },
    { year: 2026, level: 10, score: 4201.6, total: 1733, months: 8, complete: false },
  ],
  by_category: { estupro: '<3', furto_outros: 1763, roubo_outros: 318, inexistente: 5, culposo: 0 },
  same_period: { months: 8, by_year: [{ year: 2025, total: 1477 }, { year: 2026, total: 1552 }], partial_year: 2026 },
  event_venues: [{ bos: 2882, kind: 'rua', name: 'Avenida Paulista', message: '19% ...', peak_days: 4, distance_m: 265, pct_in_peak_days: 18.9 }],
  subprefecture: { id: 14, name: 'SE' },
  levels_by_hour: [8, 7, 7, 7, 8, 8, 8, 8, 9, 9, 9, 9, 9, 10, 10, 10, 10, 10, 10, 10, 10, 10, 9, 8],
  security_units: Object.fromEntries(
    ['gcm', 'bombeiros', 'policia_civil', 'policia_militar'].map((t) => [
      t,
      { nearest: { id: 1, lat: -23.5, lng: -46.6, name: 'Unidade', address: null, distance_m: 1089 }, within_1km: 0, within_2km: 1 },
    ]),
  ),
  time_precision: { none_pct: 0.4, exact_hour_pct: 45.9, period_only_pct: 53.7 },
  city_percentile: 99,
  hidden_location: { message: 'A SSP não divulga…' },
};

describe('relatório (address_report)', () => {
  it('valida a resposta real', () => {
    const r = validarRelatorio(PAULISTA);
    assert.equal(r.level, 10);
    assert.equal(r.by_period[3].period, 'noite');
    assert.equal(r.security_units.policia_militar.nearest?.distance_m, 1089);
    assert.equal(r.by_category.estupro, '<3');
    assert.equal(r.event_venues[0].kind, 'rua');
  });
  it('fora do município: distrito nulo', () => {
    assert.equal(validarRelatorio({ ...PAULISTA, district: null, subprefecture: null }).district, null);
  });
  it('ano sem dados e formato inesperado viram ErroRelatorio', () => {
    assert.throws(() => validarRelatorio({ year: 2019, error: 'sem_dados' }), (e: unknown) => e instanceof ErroRelatorio && e.tipo === 'sem_dados');
    assert.throws(() => validarRelatorio(null), ErroRelatorio);
    assert.throws(() => validarRelatorio({ ...PAULISTA, level: 11 }), ErroRelatorio);
    assert.throws(() => validarRelatorio({ ...PAULISTA, by_hour: [1, 2] }), ErroRelatorio);
    assert.throws(() => validarRelatorio({ ...PAULISTA, by_period: PAULISTA.by_period.slice().reverse() }), ErroRelatorio);
  });
  it('dia × noite', () => {
    assert.equal(fraseDiaNoite({ day: { level: 10, total: 1273 }, night: { level: 10, total: 1000 } }), 'De dia, os registros por hora são 1,3× os da noite.');
    assert.equal(fraseDiaNoite({ day: { level: 4, total: 59 }, night: { level: 8, total: 297 } }), 'À noite, os registros por hora são 5,0× os do dia.');
    assert.equal(fraseDiaNoite({ day: { level: 5, total: 100 }, night: { level: 5, total: 110 } }), 'Os registros por hora são parecidos de dia e à noite.');
    assert.match(fraseDiaNoite({ day: { level: 1, total: 3 }, night: { level: 1, total: 4 } }), /Poucos registros/);
  });
  it('mesmo período', () => {
    const r = validarRelatorio(PAULISTA);
    assert.equal(fraseMesmoPeriodo({ ...r, year: 2026, complete: false }), 'jan–ago 2026: 1.552 registros, 5% a mais que jan–ago 2025');
    assert.equal(fraseMesmoPeriodo(r), '2025: 2.283 registros, 14% a menos que 2024');
    assert.match(
      fraseMesmoPeriodo({ ...r, year: 2026, complete: false, same_period: { months: 8, partial_year: 2026, by_year: [{ year: 2025, total: 5 }, { year: 2026, total: 7 }] } }) ?? '',
      /poucos registros para comparar com jan–ago 2025/,
    );
    assert.equal(fraseMesmoPeriodo({ ...r, evolution: r.evolution.filter((a) => a.year !== 2024) }), null);
  });
  it('categorias com % e "<3" no fim', () => {
    const cats = categoriasDoRelatorio(validarRelatorio(PAULISTA).by_category, 2283, { estupro: 'Estupro', furto_outros: 'Furto', roubo_outros: 'Roubo', culposo: 'Culposo' });
    assert.deepEqual(cats.map((c) => c.chave), ['furto_outros', 'roubo_outros', 'estupro']);
    assert.equal(Math.round(cats[0].pct ?? 0), 77);
    assert.equal(cats[2].pct, null);
  });
});
