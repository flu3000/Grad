import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mapearCabecalho } from '../src/lib/colunas';
import { idBo, lerLinhaCsv, limparLinha, linhaCsv, type LinhaLimpa } from '../src/lib/limpeza';
import { densidadesPorHora, densidadesPorPeriodo, fatorAnual, somar, somaDosMeses, type Agregado } from '../src/lib/agregacao';
import { processarLinhas, REGRAS_PADRAO } from '../src/pipeline/processamento';
import { cobertura, curvaDeAtraso, somarParciais } from '../src/pipeline/consolidacao';
import { latLngToCell } from 'h3-js';

// Cabeçalho no formato 2026 (row.values começa no índice 1).
const CAB = mapearCabecalho([
  undefined,
  'NOME_DELEGACIA', 'NUM_BO', 'ANO_BO', 'DATA_REGISTRO', 'DATA_OCORRENCIA_BO', 'HORA_OCORRENCIA_BO', 'DESC_PERIODO',
  'DESCR_TIPOLOCAL', 'BAIRRO', 'LOGRADOURO', 'NUMERO_LOGRADOURO', 'LATITUDE', 'LONGITUDE', 'RUBRICA', 'NATUREZA_APURADA', 'COD IBGE',
]);
const linhaPlanilha = (o: Partial<Record<string, unknown>>) => [
  undefined,
  o.delegacia ?? '01º D.P. SE', o.num ?? 'AB1234', o.anoBo ?? 2026, o.registro ?? 46027, o.ocorrencia ?? 46019, o.hora ?? 0.625, o.periodo ?? 'NULL',
  o.tipo ?? 'Via Pública', o.bairro ?? 'SE', o.logradouro ?? 'Rua Glicério', o.numero ?? 818, o.lat ?? -23.55, o.lng ?? -46.63,
  o.rubrica ?? 'Furto (art. 155)', o.natureza ?? 'FURTO - OUTROS', o.ibge ?? 3550308,
];
const dentroDaCapital = (lat: number) => lat < -23.3 && lat > -24.1;
const origem = { arquivo: 'teste.xlsx', aba: 'JAN-JUN', linha: 2 };
const limpar = (o: Partial<Record<string, unknown>>) => limparLinha(linhaPlanilha(o), CAB, origem, dentroDaCapital);

test('limpeza: valores especiais', () => {
  const ok = limpar({}).linha!;
  assert.equal(ok.data_registro, '2026-01-05');
  assert.equal(ok.data_ocorrencia, '2025-12-28');
  assert.equal(ok.hora, '15:00');
  assert.equal(ok.periodo, null);
  assert.equal(ok.lat, -23.55);
  assert.equal(ok.sigilo, false);

  const virgula = limpar({ lat: '-23,5582629', lng: '-46,6338813' }).linha!;
  assert.equal(virgula.lat, -23.5582629);
  assert.equal(virgula.lng, -46.6338813);

  const traco = limpar({ lat: '-', lng: '-', hora: 'NULL', periodo: 'A noite' }).linha!;
  assert.equal(traco.lat, null);
  assert.equal(traco.hora, null);
  assert.equal(traco.periodo, 'noite');
  assert.equal(traco.logradouro, 'Rua Glicério'); // sem coordenada mas com endereço: candidata à geocodificação

  const sigilo = limpar({ lat: 0, lng: 0, logradouro: 'VEDAÇÃO DA DIVULGAÇÃO DOS DADOS RELATIVOS', numero: null }).linha!;
  assert.equal(sigilo.sigilo, true);
  assert.equal(sigilo.lat, null);
  assert.equal(sigilo.logradouro, null);

  const zeroComEndereco = limpar({ lat: 0, lng: 0, logradouro: 'Avenida Mário de Andrade' }).linha!;
  assert.equal(zeroComEndereco.sigilo, false); // 0 com endereço real não é sigilo
  assert.equal(zeroComEndereco.lat, null);

  assert.equal(limpar({ numero: 0 }).linha!.numero, null);
  assert.equal(limpar({ hora: '02:50:30' }).linha!.hora, '02:50');
  assert.equal(limpar({ periodo: 'Em hora incerta', hora: 'NULL' }).linha!.periodo, 'incerta');
});

test('limpeza: filtro da capital pelo código ou pelo ponto', () => {
  assert.equal(limpar({ ibge: 3548708, lat: -23.69, lng: -46.56 }).divergencia, 'codigo_outro_ponto_dentro'); // outro código, ponto dentro: fica
  assert.ok(limpar({ ibge: 3548708, lat: -23.69 }).linha);
  assert.equal(limpar({ ibge: 3548708, lat: -22.9 }).descarte, 'fora_da_capital');
  assert.equal(limpar({ ibge: 3548708, lat: '-', lng: '-' }).descarte, 'fora_da_capital');
  const capFora = limpar({ lat: -22.9 });
  assert.equal(capFora.divergencia, 'codigo_capital_ponto_fora');
  assert.ok(capFora.linha);
});

test('id_bo: estável, sem diferença de caixa/espaço, null sem número', () => {
  assert.equal(idBo('TB7197', '2025', '01º D.P. SE'), idBo(' tb7197 ', '2025', '01º d.p. se '));
  assert.notEqual(idBo('TB7197', '2025', '01º D.P. SE'), idBo('TB7197', '2026', '01º D.P. SE'));
  assert.equal(idBo(null, '2025', 'X'), null);
  assert.match(idBo('A', '1', 'B')!, /^[0-9a-f]{16}$/);
});

test('CSV: ida e volta com vírgula, aspas e vazios', () => {
  const l = limpar({ logradouro: 'Rua "A", 10', bairro: 'Sé, Centro' }).linha!;
  const volta = lerLinhaCsv(linhaCsv(l));
  assert.deepEqual(volta, l);
});

// ------------------------------------------------------------------------------------------ processamento
const base: LinhaLimpa = { ...limpar({}).linha!, data_ocorrencia: '2025-03-10', data_registro: '2025-03-11' };
const ctx = {
  excluir: new Set<number>(),
  distritoDe: (lat: number) => (lat < -23.3 && lat > -24.1 ? 'SE' : null),
  hexDoDistrito: new Map([['SE', new Map([[7, ['87a8100c6ffffff']], [8, ['88a8100c61fffff', '88a8100c63fffff']], [9, ['89a8100c603ffff']]])]]),
};
const h8 = latLngToCell(-23.55, -46.63, 8);
const k8 = (ano = 2025) => `8|${h8}|${ano}`;

test('processamento: hora exata entra na hora e no período; só período não é espalhado pelas horas', () => {
  const r = processarLinhas(
    [
      { ...base, linha: 1, hora: '19:30', periodo: null },
      { ...base, linha: 2, hora: null, periodo: 'manha' },
      { ...base, linha: 3, hora: null, periodo: 'incerta' },
    ],
    REGRAS_PADRAO,
    ctx,
  );
  const c = r.agregado.get(k8())!;
  assert.equal(c.total, 3);
  assert.deepEqual(c.totalByPeriod, [0, 1, 0, 1]); // manhã (só período) + noite (19h)
  assert.equal(c.semPeriodo, 1);
  assert.equal(c.totalByHour[19], 1);
  assert.equal(c.totalByHour.reduce((a, b) => a + b, 0), 1);
  assert.equal(c.semHora, 2);
  assert.equal(c.totalByMonth[2], 3);
  assert.equal(c.weight, 3); // furto = 1
});

test('processamento: hora vale mais que DESC_PERIODO; excluídas, fora dos anos e ponto padrão', () => {
  const r = processarLinhas(
    [
      { ...base, linha: 1, hora: '03:00', periodo: 'tarde' }, // conflito: vale a hora (madrugada)
      { ...base, linha: 2 }, // excluída pela deduplicação
      { ...base, linha: 3, data_ocorrencia: '2019-05-01' },
      { ...base, linha: 4, lat: -23.405645, lng: -46.734928 }, // Perus
      { ...base, linha: 5, rubrica: 'Ilícito extrapenal (Tema 506 STF)', natureza: 'PORTE DE ENTORPECENTES' },
    ],
    REGRAS_PADRAO,
    { ...ctx, excluir: new Set([2]) },
  );
  const c = r.agregado.get(k8())!;
  assert.equal(c.totalByPeriod[0], 1);
  assert.equal(r.global.linhasExcluidasPelaDeduplicacao, 1);
  assert.equal(r.global.foraDosAnos['2019'], 1);
  assert.equal(r.cidade[2025].semLocalizacao.pontoPadrao, 1);
  assert.equal(c.byCategory.nao_criminal, 1);
  assert.equal(c.weight, 1); // furto 1 + Tema 506 0
});

test('processamento: estupro sem coordenada em local público vai para o distrito', () => {
  const r = processarLinhas(
    [{ ...base, linha: 1, lat: null, lng: null, sigilo: true, rubrica: 'Estupro', natureza: 'ESTUPRO', bairro: 'Sé', tipo_local: 'Via Pública' }],
    REGRAS_PADRAO,
    ctx,
  );
  assert.equal(r.cidade[2025].distribuidos, 1);
  const metade = r.agregado.get('8|88a8100c61fffff|2025')!;
  assert.equal(metade.weight, 4.5); // peso 9 dividido entre 2 hexágonos
  assert.equal(metade.total, 0);
});

test('paralelo = sequencial: a soma das partes é igual ao processamento do todo', () => {
  const linhas: LinhaLimpa[] = Array.from({ length: 40 }, (_, i) => ({
    ...base,
    linha: i + 1,
    hora: i % 3 ? `${String(i % 24).padStart(2, '0')}:10` : null,
    periodo: i % 3 ? null : 'tarde',
    lat: -23.55 - (i % 5) * 0.01,
    data_ocorrencia: `202${3 + (i % 3)}-0${1 + (i % 9)}-15`,
    rubrica: i % 4 ? 'Furto (art. 155)' : 'Roubo (art. 157)',
    natureza: i % 4 ? 'FURTO - OUTROS' : 'ROUBO - OUTROS',
  }));
  const todo = processarLinhas(linhas, REGRAS_PADRAO, ctx);
  const partes = [linhas.slice(0, 13), linhas.slice(13, 27), linhas.slice(27)].map((p) => {
    const r = processarLinhas(p, REGRAS_PADRAO, ctx);
    return { agregado: Object.fromEntries(r.agregado), cidade: r.cidade, global: r.global };
  });
  const soma = somarParciais(partes);
  const ordenar = (a: Agregado) => JSON.stringify([...a].sort(([x], [y]) => x.localeCompare(y)));
  assert.equal(ordenar(soma.agregado), ordenar(todo.agregado));
  assert.deepEqual(soma.global, todo.global);
  const somaDireta: Agregado = new Map();
  somar(somaDireta, todo.agregado);
  assert.equal(ordenar(somaDireta), ordenar(todo.agregado));
});

// --------------------------------------------------------------------------- níveis, anualização, cobertura
test('nível por período e por hora: distribuição uniforme = densidade do dia inteiro', () => {
  const dp = densidadesPorPeriodo([25, 25, 25, 25], 2, 1);
  assert.deepEqual(dp, [50, 50, 50, 50]); // 100 / 2 km²
  const dh = densidadesPorHora(Array(24).fill(1), 1, 1);
  assert.ok(dh.every((x) => Math.abs(x - 24) < 1e-9));
  // Fator da cidade corrige os BOs sem período: metade sem período → fator 2 → média dos períodos = dia inteiro.
  assert.deepEqual(densidadesPorPeriodo([12.5, 12.5, 12.5, 12.5], 2, 2), [50, 50, 50, 50]);
});

test('janela móvel de 3 h é circular', () => {
  const w = Array(24).fill(0);
  w[0] = 3;
  const dh = densidadesPorHora(w, 1, 1);
  assert.equal(dh[23], 24); // (0 + 0 + 3)/3 × 24
  assert.equal(dh[0], 24);
  assert.equal(dh[1], 24);
  assert.equal(dh[2], 0);
});

test('anualização do ano parcial', () => {
  assert.equal(fatorAnual(12), 1);
  assert.equal(fatorAnual(8), 1.5);
  assert.equal(somaDosMeses([1, 1, 1, 1, 1, 1, 1, 1, 9, 0, 0, 0], 8), 8);
});

test('curva de atraso e cobertura do ano parcial', () => {
  // 3 anos de referência: 90% registrado no mês, 9% no seguinte, 1% dois meses depois; 2026 até setembro.
  const atraso: Record<string, Record<string, number>> = {};
  for (let a = 2023; a <= 2025; a++) for (let m = 1; m <= 12; m++) atraso[`${a}-${String(m).padStart(2, '0')}`] = { 0: 90, 1: 9, 2: 1 };
  for (let m = 1; m <= 7; m++) atraso[`2026-0${m}`] = { 0: 90, 1: 9, 2: 1 };
  atraso['2026-08'] = { 0: 90, 1: 9 };
  atraso['2026-09'] = { 0: 90 };
  const cidade = { 2023: { atraso } } as unknown as Parameters<typeof curvaDeAtraso>[0];
  const curva = curvaDeAtraso(cidade);
  assert.equal(curva.corte, '2026-09');
  assert.ok(Math.abs(curva.curva[0] - 0.9) < 1e-9);
  assert.ok(Math.abs(curva.curva[1] - 0.99) < 1e-9);
  const c = cobertura(2026, { atraso } as never, curva);
  assert.equal(c.last_complete_month, 8); // setembro com 90% < 95% fica de fora
  assert.equal(c.complete, false);
  assert.equal(cobertura(2025, { atraso } as never, curva).complete, true);
});

test('geocodificação: decisão por nível e origem do distrito; nunca sigilo nem lista sensível', async () => {
  const { decidir, situacaoDoPonto, casasDecimais } = await import('../src/pipeline/geocodificacao');
  const { GEOCODIFICACAO } = await import('../src/config/geocodificacao');
  const distritoDe = () => 'SE';
  const base = { id_bo: 'x', data_registro: null, data_ocorrencia: '2025-01-01', hora: null, periodo: null, tipo_local: null, subtipo_local: null, bairro: 'SE', logradouro: 'RUA X', numero: 10, lat: null, lng: null, sigilo: false, rubrica: 'Furto', conduta: null, natureza: 'FURTO - OUTROS', mes_estatistica: null, ano_estatistica: null, cod_ibge: 3550308, arquivo: 'a', aba: 'a', linha: 1 };
  const geo = (nivel: string, dica: 'ponto' | 'bairro' | 'localidade' | null) => () => ({ ok: true, lat: -23.55, lng: -46.63, nivel, dica });
  const sem = situacaoDoPonto(base, true, distritoDe);
  assert.equal(decidir(base, 'furto_outros', sem, GEOCODIFICACAO, geo('exato', 'bairro'), distritoDe).origem, 'preenchido');
  assert.equal(decidir(base, 'furto_outros', sem, GEOCODIFICACAO, geo('exato', null), distritoDe).origem, 'sem'); // sem distrito, não
  assert.equal(decidir(base, 'furto_outros', sem, GEOCODIFICACAO, geo('interpolado', 'localidade'), distritoDe).origem, 'sem');
  assert.equal(decidir(base, 'furto_outros', sem, GEOCODIFICACAO, geo('curto', 'bairro'), distritoDe).origem, 'sem');
  assert.equal(decidir(base, 'furto_outros', sem, null, geo('exato', 'bairro'), distritoDe).origem, 'sem'); // linha de base
  assert.equal(decidir({ ...base, sigilo: true }, 'furto_outros', sem, GEOCODIFICACAO, geo('exato', 'bairro'), distritoDe).origem, 'sem');
  assert.equal(decidir(base, 'estupro', sem, GEOCODIFICACAO, geo('exato', 'bairro'), distritoDe).origem, 'sem');
  assert.equal(decidir({ ...base, rubrica: 'Lesão corporal - violência doméstica' }, 'lesao_dolosa', sem, GEOCODIFICACAO, geo('exato', 'bairro'), distritoDe).origem, 'sem');
  // ponto suspeito (3 casas) a mais de 300 m → troca; ponto confiável fica
  const suspeito = { ...base, lat: -23.56, lng: -46.631 };
  assert.equal(casasDecimais(-23.56), 2);
  assert.equal(decidir(suspeito, 'furto_outros', situacaoDoPonto(suspeito, true, distritoDe), GEOCODIFICACAO, geo('exato', 'ponto'), distritoDe).origem, 'trocado');
  const confiavel = { ...base, lat: -23.561234, lng: -46.631234 };
  assert.equal(decidir(confiavel, 'furto_outros', situacaoDoPonto(confiavel, true, distritoDe), GEOCODIFICACAO, geo('exato', 'ponto'), distritoDe).origem, 'ssp');
  // ponto padrão → perde a coordenada e pode ser preenchido
  const padrao = { ...base, lat: -23.555771, lng: -46.639557 };
  const sp = situacaoDoPonto(padrao, true, distritoDe);
  assert.equal(sp.pontoPadrao, true);
  assert.equal(decidir(padrao, 'furto_outros', sp, GEOCODIFICACAO, geo('exato', 'bairro'), distritoDe).origem, 'preenchido');
  assert.equal(decidir(padrao, 'furto_outros', sp, GEOCODIFICACAO, () => ({ ok: false, falha: 'ambiguo' as const, dica: 'bairro' as const }), distritoDe).origem, 'sem');
});
