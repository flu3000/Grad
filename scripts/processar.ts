/**
 * Estágio B: processa as partes limpas em paralelo → scripts/out/cache/parciais/<hash>/ (pula o que está em cache).
 *
 *   npm run data:processar
 *   Opções: --partes=12-20 (reprocessa só essas)  --sequencial (depuração)  --workers=N
 */
import { arg } from './src/lib/paths';
import { processarTudo, REGRAS_PADRAO } from './src/pipeline/processamento';

export function opcoesDoProcessamento() {
  const p = arg('partes')?.match(/^(\d+)(?:-(\d+))?$/);
  return {
    workers: arg('workers') ? Number(arg('workers')) : undefined,
    sequencial: arg('sequencial') === 'true',
    partes: p ? ([Number(p[1]), Number(p[2] ?? p[1])] as [number, number]) : undefined,
  };
}

if (require.main === module)
  processarTudo(REGRAS_PADRAO, opcoesDoProcessamento())
    .then((r) => console.log(`Parciais em ${r.parciais.length ? require('path').dirname(r.parciais[0]) : '-'}`))
    .catch((err) => {
      console.error(process.env.DEBUG && err instanceof Error ? err.stack : err instanceof Error ? err.message : err);
      process.exit(1);
    });
