/**
 * Estágio C: soma as parciais (processando antes o que faltar), calcula cobertura, escala fixa, níveis e invariantes.
 *
 *   npm run data:consolidar            → scripts/out/consolidado/linha_de_base/ + resumo no terminal
 *   Opções: as do data:processar, --conferir-sequencial=N (reprocessa N partes em sequência e compara; padrão 2)
 */
import { TOTAL_NIVEIS, RESOLUTIONS } from './src/lib/scoring';
import { arg } from './src/lib/paths';
import { consolidar, type ResultadoConsolidacao } from './src/pipeline/consolidacao';
import { processarTudo, REGRAS_PADRAO, type ResultadoProcessamento } from './src/pipeline/processamento';
import { opcoesDoProcessamento } from './processar';

const pct = (a: number, b: number) => (b ? `${((100 * a) / b).toFixed(1)}%` : '-');

export function imprimirConsolidacao(c: ResultadoConsolidacao, proc: ResultadoProcessamento) {
  const r = c.relatorio as Record<string, any>;
  const L = console.log;
  L(`\n================ LINHA DE BASE (${c.nome}) ================`);
  L(`Índice de BOs: ${proc.indice.bos} BOs; ${proc.indice.excluidas} linhas excluídas (mesmo BO); ${proc.indice.naturezasSecundarias.bos} BOs com naturezas secundárias; ${proc.indice.repetidosEntreArquivos} BOs em mais de um arquivo`);
  for (const [k, n] of proc.indice.naturezasSecundarias.combinacoes.slice(0, 8)) L(`   ${n}  ${k}`);
  L(`Fora dos anos: ${JSON.stringify(r.global.foraDosAnos)} | sem data de ocorrência: ${r.global.semDataDeOcorrencia}`);
  L('\nAno  | linhas  | com ponto | distribuídos | sem localização (sigilo / sem coord. / fora / ponto padrão) | hora / só período / nenhum');
  for (const d of c.datasets) {
    const cid = r.cidade[d.year];
    const s = cid.semLocalizacao;
    L(
      `${d.year} | ${cid.linhas} | ${cid.pontos} | ${cid.distribuidos} | ${s.sigilo} / ${s.semCoordenada} / ${s.pontoForaDoMunicipio} / ${s.pontoPadrao} | ` +
        `${pct(cid.horario.hora, cid.pontos)} / ${pct(cid.horario.soPeriodo, cid.pontos)} / ${pct(cid.horario.nenhum, cid.pontos)}`,
    );
  }
  L('\nBOs com ponto por período (madrugada / manhã / tarde / noite):');
  for (const d of c.datasets) L(`  ${d.year}: ${r.cidade[d.year].pontosPorPeriodo.join(' / ')}`);
  L('\nBOs com ponto por categoria:');
  const cats = [...new Set(c.datasets.flatMap((d) => Object.keys(r.cidade[d.year].pontosPorCategoria)))].sort(
    (a, b) => (r.cidade[c.datasets[0].year].pontosPorCategoria[b] ?? 0) - (r.cidade[c.datasets[0].year].pontosPorCategoria[a] ?? 0),
  );
  L(`  ${'categoria'.padEnd(20)} ${c.datasets.map((d) => String(d.year).padStart(8)).join('')}`);
  for (const k of cats) L(`  ${k.padEnd(20)} ${c.datasets.map((d) => String(r.cidade[d.year].pontosPorCategoria[k] ?? 0).padStart(8)).join('')}`);

  L(`\nCurva de atraso (fração registrada até o fim de M+k, janela de ${c.curva.curva.length - 1} meses; corte ${c.curva.corte}):`);
  L(`  ${c.curva.curva.map((x, k) => `M+${k}: ${(100 * x).toFixed(1)}%`).join(' | ')}`);
  L(`  registrados depois de M+${c.curva.curva.length - 1} (meses com ≥ 24 de acompanhamento): ${(100 * c.curva.caudaDepoisDaJanela).toFixed(2)}%`);
  L('Cobertura:');
  for (const d of c.datasets)
    L(
      `  ${d.year}: meses ${d.first_month}–${d.last_month}, último completo ${d.last_complete_month}, completo ${d.complete}` +
        (d.complete ? '' : ` | completude por mês: ${d.completude_por_mes.map((x, i) => `${i + 1}:${(100 * x).toFixed(0)}%`).join(' ')}`),
    );
  L('\nCortes por resolução (peso/km² por ano):');
  for (const res of RESOLUTIONS) L(`  res ${res}: ${c.cortes[res].map((x) => x.toFixed(1)).join(' | ')}`);
  L(`\nHexágonos por nível 1..${TOTAL_NIVEIS} (grade completa):`);
  for (const d of c.datasets) for (const res of RESOLUTIONS) L(`  ${d.year} res ${res}: ${r.hexagonosPorNivel[d.year][res].join(' / ')}`);
  L(`\nFatores da cidade (peso total ÷ peso com período | com hora): ${c.datasets.map((d) => `${d.year} ${r.fatores[d.year].periodo.toFixed(3)} | ${r.fatores[d.year].hora.toFixed(3)}`).join('; ')}`);
  L('\nInvariantes:');
  for (const i of c.invariantes) L(`  ${i.ok ? '✓' : '✗'} ${i.nome} — ${i.detalhe}`);
  L(`\nTempos: processamento ${proc.segundos} s (índice ${proc.segundosIndice} s, ${proc.processadas} partes com ${proc.workers} processos, ${proc.puladas} em cache) | consolidação ${c.segundos} s`);
  L(`Arquivos: ${c.pasta}`);
}

async function main() {
  const proc = await processarTudo(REGRAS_PADRAO, opcoesDoProcessamento());
  const c = await consolidar(proc, REGRAS_PADRAO, { nome: 'linha_de_base', escala: 'fixa', conferirSequencial: Number(arg('conferir-sequencial') ?? 2) });
  imprimirConsolidacao(c, proc);
  if (c.invariantes.some((i) => !i.ok)) {
    console.error('\nHá invariantes falhando.');
    process.exit(2);
  }
}

if (require.main === module)
  main().catch((err) => {
    console.error(process.env.DEBUG && err instanceof Error ? err.stack : err instanceof Error ? err.message : err);
    process.exit(1);
  });
