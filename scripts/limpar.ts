/**
 * Estágio A: limpeza das planilhas da SSP-SP → data/SSP-SP/limpo/ (partes .csv.gz de 100 mil linhas).
 *
 *   npm run data:limpar                 → extrai o que mudou (pula arquivos já extraídos, pelo manifesto)
 *   Opções: --forcar (refaz tudo)  --workers=N
 *
 * Relatório: scripts/out/relatorio_limpeza.json + resumo no terminal. Nada sai do computador.
 */
import fs from 'fs';
import path from 'path';
import { extrairTudo, type Manifesto } from './src/pipeline/extracao';
import { arg, outDir } from './src/lib/paths';

const mb = (b: number) => `${(b / 2 ** 20).toFixed(0)} MB`;

export function resumoDaLimpeza(m: Manifesto) {
  const porAno: Record<string, { arquivos: string[]; lidas: number; mantidas: number; descartadas: Record<string, number>; divergencias: Record<string, number>; bytesOrigem: number; bytesLimpo: number; partes: number; segundos: number }> = {};
  for (const a of Object.values(m.arquivos)) {
    const k = String(a.ano ?? 'sem_ano');
    const y = (porAno[k] ??= { arquivos: [], lidas: 0, mantidas: 0, descartadas: {}, divergencias: {}, bytesOrigem: 0, bytesLimpo: 0, partes: 0, segundos: 0 });
    y.arquivos.push(a.origem);
    y.lidas += a.lidas;
    y.mantidas += a.mantidas;
    for (const [mo, n] of Object.entries(a.descartadas)) y.descartadas[mo] = (y.descartadas[mo] ?? 0) + n;
    for (const [mo, n] of Object.entries(a.divergencias)) y.divergencias[mo] = (y.divergencias[mo] ?? 0) + n;
    y.bytesOrigem += a.bytesOrigem;
    y.bytesLimpo += a.bytesLimpo;
    y.partes += a.partes.length;
    y.segundos += a.segundos;
  }
  return porAno;
}

async function main() {
  const { manifesto, segundos } = await extrairTudo({ forcar: arg('forcar') === 'true', workers: arg('workers') ? Number(arg('workers')) : undefined });
  const porAno = resumoDaLimpeza(manifesto);
  const arquivos = Object.values(manifesto.arquivos);
  console.log('\nAno  | lidas     | mantidas  | descartadas (fora da capital) | código ≠ ponto (cap. fora / outro dentro) | xlsx → csv.gz | partes');
  for (const [ano, y] of Object.entries(porAno).sort())
    console.log(
      `${ano} | ${String(y.lidas).padStart(9)} | ${String(y.mantidas).padStart(9)} | ${String(y.descartadas.fora_da_capital ?? 0).padStart(9)} | ` +
        `${y.divergencias.codigo_capital_ponto_fora ?? 0} / ${y.divergencias.codigo_outro_ponto_dentro ?? 0} | ${mb(y.bytesOrigem)} → ${mb(y.bytesLimpo)} | ${y.partes}`,
    );
  console.log(`Colunas descartadas: ${[...new Set(arquivos.flatMap((a) => a.colunasDescartadas))].join(', ')}`);
  const faltando = arquivos.filter((a) => a.colunasFaltando.length).map((a) => `${a.origem}: ${a.colunasFaltando.join(', ')}`);
  if (faltando.length) console.log(`Colunas que faltam: ${faltando.join(' | ')}`);
  console.log(`Tempo do estágio: ${segundos} s (soma por arquivo: ${arquivos.reduce((s, a) => s + a.segundos, 0)} s)`);
  fs.mkdirSync(outDir, { recursive: true });
  const f = path.join(outDir, 'relatorio_limpeza.json');
  fs.writeFileSync(f, JSON.stringify({ geradoEm: new Date().toISOString(), segundos, porAno, arquivos: arquivos.map(({ partes, ...a }) => ({ ...a, partes: partes.length })) }, null, 2));
  console.log(`Relatório: ${f}`);
}

if (require.main === module)
  main().catch((err) => {
    console.error(process.env.DEBUG && err instanceof Error ? err.stack : err instanceof Error ? err.message : err);
    process.exit(1);
  });
