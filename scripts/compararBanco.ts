/**
 * Compara 2025 da linha de base com o que está hoje no banco (hex_cells), decompondo a diferença em passos:
 * regras antigas no arquivo novo → deduplicação → categoria mais grave → Tema 506 → ponto de Perus → escala fixa.
 * Só LÊ o Supabase (select em hex_cells); não grava nada.
 *
 *   npm run data:comparar-banco          → scripts/out/comparacao_banco_2025.json + resumo
 */
import fs from 'fs';
import path from 'path';
import { adminClient } from './src/lib/supabase';
import { outDir } from './src/lib/paths';
import { RESOLUTIONS } from './src/lib/scoring';
import { consolidar, type Escala } from './src/pipeline/consolidacao';
import { processarTudo, REGRAS_PADRAO, type Regras } from './src/pipeline/processamento';

const ANO = 2025;

interface Passo {
  nome: string;
  motivo: string;
  regras: Regras;
  escala: Escala;
}

const base = { anos: REGRAS_PADRAO.anos, geocodificacao: null };
const PASSOS: Passo[] = [
  { nome: 'v0_regras_antigas', motivo: 'arquivo novo de 2025 com as regras antigas (todas as linhas, escala só de 2025)', regras: { ...base, deduplicar: 'nenhuma', tema506: false, pontosPadrao: false }, escala: 'por_ano' },
  { nome: 'v1_deduplicacao', motivo: 'deduplicação (mesmo BO e mesma categoria contam uma vez)', regras: { ...base, deduplicar: 'bo_categoria', tema506: false, pontosPadrao: false }, escala: 'por_ano' },
  { nome: 'v2_categoria_mais_grave', motivo: 'BO conta uma vez, na categoria mais grave', regras: { ...base, deduplicar: 'bo', tema506: false, pontosPadrao: false }, escala: 'por_ano' },
  { nome: 'v3_tema_506', motivo: 'Tema 506 do STF → não criminal', regras: { ...base, deduplicar: 'bo', tema506: true, pontosPadrao: false }, escala: 'por_ano' },
  { nome: 'v4_ponto_de_perus', motivo: 'pontos padrão confirmados (Perus e Liberdade) → sem localização', regras: REGRAS_PADRAO, escala: 'por_ano' },
  { nome: 'v5_escala_fixa', motivo: 'escala fixa (cortes de 2023–2025 juntos) = linha de base', regras: REGRAS_PADRAO, escala: 'fixa' },
];

async function lerBanco(): Promise<Map<string, { level: number; total: number }>> {
  const db = adminClient();
  const out = new Map<string, { level: number; total: number }>();
  for (let de = 0; ; de += 1000) {
    const { data, error } = await db.from('hex_cells').select('h3_index,resolution,level,counts').order('h3_index').range(de, de + 999);
    if (error) throw new Error(`Erro lendo hex_cells: ${error.message}`);
    for (const r of data ?? []) out.set(`${r.resolution}|${r.h3_index}`, { level: r.level, total: Number((r.counts as { total?: number })?.total ?? 0) });
    if (!data || data.length < 1000) break;
  }
  return out;
}

async function main() {
  console.log('Lendo hex_cells do Supabase (só leitura)...');
  const banco = await lerBanco();
  console.log(`  ${banco.size} hexágonos no banco`);
  const niveis: { nome: string; motivo: string; mapa: Map<string, { level: number; total: number }> }[] = [{ nome: 'banco', motivo: 'banco atual (planilha antiga de 2025)', mapa: banco }];
  for (const p of PASSOS) {
    console.log(`\n${p.nome}: ${p.motivo}`);
    const proc = await processarTudo(p.regras, { silencioso: true });
    const c = await consolidar(proc, p.regras, { nome: p.nome, escala: p.escala, gravarArquivos: false });
    const mapa = new Map<string, { level: number; total: number }>();
    for (const l of c.linhas) if (l.year === ANO) mapa.set(`${l.resolution}|${l.h3_index}`, { level: l.level, total: Number(l.counts.total ?? 0) });
    niveis.push({ nome: p.nome, motivo: p.motivo, mapa });
  }
  // Grade = todos os hexágonos do banco (a grade completa do município); ausente = nível 1.
  const chaves = [...banco.keys()];
  const nivel = (m: Map<string, { level: number }>, k: string) => m.get(k)?.level ?? 1;
  const passos = niveis.slice(1).map((n, i) => {
    const antes = niveis[i];
    const porRes = Object.fromEntries(
      RESOLUTIONS.map((r) => {
        const ks = chaves.filter((k) => k.startsWith(`${r}|`));
        const mudou = ks.filter((k) => nivel(n.mapa, k) !== nivel(antes.mapa, k));
        const subiu = mudou.filter((k) => nivel(n.mapa, k) > nivel(antes.mapa, k)).length;
        return [r, { hexagonos: ks.length, mudaram: mudou.length, subiram: subiu, desceram: mudou.length - subiu }];
      }),
    );
    return { passo: n.nome, motivo: n.motivo, porResolucao: porRes };
  });
  const final = niveis.at(-1)!;
  const res8 = chaves.filter((k) => k.startsWith('8|'));
  const top = res8
    .map((k) => ({ k, d: nivel(final.mapa, k) - nivel(banco, k) }))
    .filter((x) => x.d)
    .sort((a, b) => Math.abs(b.d) - Math.abs(a.d) || b.d - a.d)
    .slice(0, 20)
    .map(({ k, d }) => {
      const trilha = niveis.map((n) => nivel(n.mapa, k));
      // Motivo principal: o passo com a maior mudança de nível nesse hexágono.
      let maior = 0;
      let motivo = '';
      for (let i = 1; i < niveis.length; i++) {
        const dd = trilha[i] - trilha[i - 1];
        if (Math.abs(dd) > Math.abs(maior)) (maior = dd), (motivo = niveis[i].motivo);
      }
      return {
        h3: k.slice(2),
        nivelBanco: trilha[0],
        nivelNovo: trilha.at(-1),
        diferenca: d,
        trilha: trilha.join(' → '),
        boBanco: banco.get(k)?.total ?? 0,
        boNovo: final.mapa.get(k)?.total ?? 0,
        motivoPrincipal: motivo,
      };
    });
  const relatorio = { ano: ANO, passos, top20_res8: top };
  fs.writeFileSync(path.join(outDir, 'comparacao_banco_2025.json'), JSON.stringify(relatorio, null, 2));

  console.log('\n================ 2025: BANCO × LINHA DE BASE ================');
  console.log('Passo                    | res 7 (mudaram ↑/↓) | res 8 | res 9');
  for (const p of passos)
    console.log(
      `${p.passo.padEnd(24)} | ${RESOLUTIONS.map((r) => `${p.porResolucao[r].mudaram} (${p.porResolucao[r].subiram}/${p.porResolucao[r].desceram}) de ${p.porResolucao[r].hexagonos}`).join(' | ')}`,
    );
  const total = Object.fromEntries(
    RESOLUTIONS.map((r) => {
      const ks = chaves.filter((k) => k.startsWith(`${r}|`));
      return [r, ks.filter((k) => nivel(final.mapa, k) !== nivel(banco, k)).length];
    }),
  );
  console.log(`Banco → linha de base, total que mudou de nível: ${RESOLUTIONS.map((r) => `res ${r}: ${total[r]}`).join(' | ')}`);
  console.log('\n20 hexágonos (res 8) que mais mudaram (trilha: banco → v0 … v5):');
  for (const t of top) console.log(`  ${t.h3}  ${t.nivelBanco} → ${t.nivelNovo}  [${t.trilha}]  BOs ${t.boBanco} → ${t.boNovo}  | ${t.motivoPrincipal}`);
  console.log(`\nRelatório: ${path.join(outDir, 'comparacao_banco_2025.json')}`);
}

main().catch((err) => {
  console.error(process.env.DEBUG && err instanceof Error ? err.stack : err instanceof Error ? err.message : err);
  process.exit(1);
});
