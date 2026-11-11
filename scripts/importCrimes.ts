/**
 * Pipeline completo dos BOs da SSP-SP: A (limpeza) → B (processamento) → C (consolidação).
 *
 *   npm run data:import-crimes             → roda os 3 estágios (pula o que está em cache) e mostra a linha de base
 *   npm run data:import-crimes -- --gravar → não grava: a gravação é o npm run data:gravar (depois do data:verificar)
 *
 * Os estágios também rodam separados: data:limpar, data:processar e data:consolidar.
 */
import { arg } from './src/lib/paths';
import { extrairTudo } from './src/pipeline/extracao';
import { processarTudo, REGRAS_PADRAO } from './src/pipeline/processamento';
import { consolidar } from './src/pipeline/consolidacao';
import { imprimirConsolidacao } from './consolidar';
import { opcoesDoProcessamento } from './processar';

async function main() {
  console.log('A. Limpeza');
  await extrairTudo({ forcar: arg('forcar') === 'true' });
  console.log('B. Processamento');
  const proc = await processarTudo(REGRAS_PADRAO, opcoesDoProcessamento());
  console.log('C. Consolidação');
  const c = await consolidar(proc, REGRAS_PADRAO, { nome: 'final', escala: 'fixa', conferirSequencial: 2 });
  imprimirConsolidacao(c, proc);
  if (c.invariantes.some((i) => !i.ok)) throw new Error('Há invariantes falhando: nada será gravado.');
  if (arg('gravar') === 'true')
    throw new Error('A gravação é separada: rode npm run data:verificar e depois npm run data:gravar (simula; -- --gravar grava).');
  console.log('\nNada foi gravado.');
}

main().catch((err) => {
  console.error(process.env.DEBUG && err instanceof Error ? err.stack : err instanceof Error ? err.message : err);
  process.exit(1);
});
