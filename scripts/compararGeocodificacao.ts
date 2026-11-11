/**
 * Efeito da Etapa 2 no mapa, passo a passo, contra a linha de base gravada pela Etapa 1
 * (cópia em scripts/out/consolidado/linha_de_base_etapa1/hex_stats.ndjson.gz):
 *   v1 ponto padrão da Liberdade → v2 anualização sazonal de 2026 → v3 geocodificação pelo CNEFE.
 * Grava o resultado final em scripts/out/consolidado/geocodificado/ e o comparativo em
 * scripts/out/comparacao_geocodificacao.json. Não grava nada no Supabase.
 *
 *   npm run data:comparar-geocodificacao   (precisa do data:geocodificar)
 */
import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import { imprimirConsolidacao } from './consolidar';
import { outDir } from './src/lib/paths';
import { RESOLUTIONS } from './src/lib/scoring';
import { consolidar, gradeDoMunicipio, type Anualizacao, type ResultadoConsolidacao } from './src/pipeline/consolidacao';
import { processarTudo, REGRAS_COM_GEOCODIFICACAO, REGRAS_PADRAO, type Regras, type ResultadoProcessamento } from './src/pipeline/processamento';

interface Hex {
  level: number;
  total: number;
  geocodificado: number;
  trocado: number;
}
type Mapa = Map<string, Hex>; // "res|h3|ano"

const PASSOS: { nome: string; motivo: string; regras: Regras; anualizacao: Anualizacao; gravar: boolean }[] = [
  { nome: 'v1_ponto_liberdade', motivo: 'ponto padrão da Liberdade (-23,555771 / -46,639557) → sem localização', regras: REGRAS_PADRAO, anualizacao: 'linear', gravar: false },
  { nome: 'v2_anualizacao_sazonal', motivo: '2026 anualizado pela fração sazonal jan–ago em vez de 12/8', regras: REGRAS_PADRAO, anualizacao: 'sazonal', gravar: false },
  { nome: 'geocodificado', motivo: 'geocodificação pelo CNEFE (preenche sem coordenada / ponto padrão; troca ponto suspeito)', regras: REGRAS_COM_GEOCODIFICACAO, anualizacao: 'sazonal', gravar: true },
];

function lerBase(): Mapa {
  const f = path.join(outDir, 'consolidado', 'linha_de_base_etapa1', 'hex_stats.ndjson.gz');
  if (!fs.existsSync(f)) throw new Error(`Linha de base não encontrada (${f}). Ela é a da Etapa 1 (data:consolidar antes desta etapa).`);
  const m: Mapa = new Map();
  for (const l of zlib.gunzipSync(fs.readFileSync(f)).toString('utf-8').split('\n')) {
    if (!l) continue;
    const x = JSON.parse(l) as { h3_index: string; year: number; resolution: number; level: number; counts: Record<string, number> };
    m.set(`${x.resolution}|${x.h3_index}|${x.year}`, { level: x.level, total: x.counts.total ?? 0, geocodificado: 0, trocado: 0 });
  }
  return m;
}

const doResultado = (c: ResultadoConsolidacao): Mapa =>
  new Map(
    c.linhas.map((l) => [
      `${l.resolution}|${l.h3_index}|${l.year}`,
      { level: l.level, total: Number(l.counts.total ?? 0), geocodificado: Number(l.counts.geocodificado ?? 0), trocado: Number(l.counts.trocado ?? 0) },
    ]),
  );

async function main() {
  const t0 = Date.now();
  const base = lerBase();
  const versoes: { nome: string; motivo: string; mapa: Mapa }[] = [{ nome: 'linha_de_base', motivo: 'Etapa 1', mapa: base }];
  let final: { c: ResultadoConsolidacao; proc: ResultadoProcessamento } | null = null;
  for (const p of PASSOS) {
    console.log(`\n${p.nome}: ${p.motivo}`);
    const proc = await processarTudo(p.regras, { silencioso: !p.gravar });
    const c = await consolidar(proc, p.regras, { nome: p.nome, escala: 'fixa', anualizacao: p.anualizacao, conferirSequencial: p.gravar ? 2 : 0, gravarArquivos: p.gravar });
    versoes.push({ nome: p.nome, motivo: p.motivo, mapa: doResultado(c) });
    if (p.gravar) final = { c, proc };
  }
  const grade = gradeDoMunicipio();
  const anos = REGRAS_PADRAO.anos;
  const nivel = (m: Mapa, k: string) => m.get(k)?.level ?? 1;
  const chaves = (res: number, ano: number) => [...grade.get(res)!].map((h) => `${res}|${h}|${ano}`);

  const passos = versoes.slice(1).map((v, i) => {
    const antes = versoes[i].mapa;
    const porAno = Object.fromEntries(
      anos.map((ano) => [
        ano,
        Object.fromEntries(
          RESOLUTIONS.map((res) => {
            const ks = chaves(res, ano);
            const mudou = ks.filter((k) => nivel(v.mapa, k) !== nivel(antes, k));
            const subiu = mudou.filter((k) => nivel(v.mapa, k) > nivel(antes, k)).length;
            return [res, { hexagonos: ks.length, mudaram: mudou.length, subiram: subiu, desceram: mudou.length - subiu }];
          }),
        ),
      ]),
    );
    return { passo: v.nome, motivo: v.motivo, porAno };
  });

  // 20 hexágonos (res 8, qualquer ano) que mais mudaram da linha de base para o final, com o motivo principal.
  const ultimo = versoes.at(-1)!.mapa;
  const top = anos
    .flatMap((ano) => chaves(8, ano))
    .map((k) => ({ k, d: nivel(ultimo, k) - nivel(base, k) }))
    .filter((x) => x.d)
    .sort((a, b) => Math.abs(b.d) - Math.abs(a.d) || (ultimo.get(b.k)?.geocodificado ?? 0) - (ultimo.get(a.k)?.geocodificado ?? 0))
    .slice(0, 20)
    .map(({ k, d }) => {
      const trilha = versoes.map((v) => nivel(v.mapa, k));
      let maior = 0;
      let motivo = '';
      for (let i = 1; i < versoes.length; i++) {
        const dd = trilha[i] - trilha[i - 1];
        if (Math.abs(dd) > Math.abs(maior)) (maior = dd), (motivo = versoes[i].nome);
      }
      const [, h3, ano] = k.split('|');
      const f = ultimo.get(k);
      return {
        h3,
        ano: Number(ano),
        nivelBase: trilha[0],
        nivelFinal: trilha.at(-1),
        diferenca: d,
        trilha: trilha.join(' → '),
        bosBase: base.get(k)?.total ?? 0,
        bosFinal: f?.total ?? 0,
        geocodificados: f?.geocodificado ?? 0,
        trocados: f?.trocado ?? 0,
        motivoPrincipal: motivo,
      };
    });

  const c = final!.c;
  const r = c.relatorio as Record<string, any>;
  const recuperacao = Object.fromEntries(
    c.datasets.map((d) => {
      const cid = r.cidade[d.year];
      const g = cid.geo;
      return [
        d.year,
        {
          linhas: cid.linhas,
          comPonto: cid.pontos,
          preenchidosPorNivel: g.preenchidos,
          preenchidosPorCategoria: g.preenchidosPorCategoria,
          trocadosPorNivel: g.trocados,
          removidos: g.removidos,
          semLocalizacao: cid.semLocalizacao,
          falhasDosCandidatos: g.falhas,
          bloqueadosPelaListaSensivel: g.bloqueados,
        },
      ];
    }),
  );
  const saida = { passos, top20_res8: top, recuperacao, anualizacao: r.anualizacao, invariantes: c.invariantes, segundos: Math.round((Date.now() - t0) / 1000) };
  fs.writeFileSync(path.join(outDir, 'comparacao_geocodificacao.json'), JSON.stringify(saida, null, 2));

  imprimirConsolidacao(c, final!.proc);
  const L = console.log;
  L('\n================ RECUPERAÇÃO PELA GEOCODIFICAÇÃO ================');
  for (const [ano, x] of Object.entries(recuperacao) as [string, any][]) {
    const soma = (o: Record<string, number>) => Object.values(o).reduce((a, b) => a + b, 0);
    L(`${ano}: ${soma(x.preenchidosPorNivel)} preenchidos ${JSON.stringify(x.preenchidosPorNivel)} | ${soma(x.trocadosPorNivel)} trocados | sem localização ${soma(x.semLocalizacao)} ${JSON.stringify(x.semLocalizacao)}`);
    L(`   por categoria: ${Object.entries(x.preenchidosPorCategoria as Record<string, number>).sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k} ${n}`).join(', ')}`);
    L(`   falhas dos candidatos: ${Object.entries(x.falhasDosCandidatos as Record<string, number>).sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k} ${n}`).join(', ')} | lista sensível: ${x.bloqueadosPelaListaSensivel}`);
  }
  L('\nAnualização:');
  for (const [ano, a] of Object.entries(r.anualizacao.porAno) as [string, any][])
    if (a.meses < 12) L(`  ${ano}: meses 1–${a.meses}, fração jan–${a.meses} = ${a.fracaoMedia} (por ano ${JSON.stringify(a.fracaoPorAno)}) → fator ${a.fator} (linear ${a.fatorLinear})`);
  L('\n================ EFEITO NO MAPA (hexágonos que mudaram de nível; grade completa) ================');
  for (const p of passos) {
    L(`${p.passo}: ${p.motivo}`);
    for (const ano of anos) L(`   ${ano}: ${RESOLUTIONS.map((res) => `res ${res} ${p.porAno[ano][res].mudaram} (↑${p.porAno[ano][res].subiram} ↓${p.porAno[ano][res].desceram})`).join(' | ')}`);
  }
  L('\nLinha de base → final, total que mudou:');
  for (const ano of anos)
    L(`   ${ano}: ${RESOLUTIONS.map((res) => `res ${res} ${chaves(res, ano).filter((k) => nivel(ultimo, k) !== nivel(base, k)).length} de ${grade.get(res)!.size}`).join(' | ')}`);
  L('\n20 hexágonos (res 8) que mais mudaram (trilha: base → v1 → v2 → final):');
  for (const t of top)
    L(`  ${t.h3} ${t.ano}  ${t.nivelBase} → ${t.nivelFinal}  [${t.trilha}]  BOs ${t.bosBase} → ${t.bosFinal} (geocodificados ${t.geocodificados}, trocados ${t.trocados}) | ${t.motivoPrincipal}`);
  L(`\nRelatório: ${path.join(outDir, 'comparacao_geocodificacao.json')} (${saida.segundos} s)`);
  if (c.invariantes.some((i) => !i.ok)) {
    console.error('\nHá invariantes falhando.');
    process.exit(2);
  }
}

main().catch((err) => {
  console.error(process.env.DEBUG && err instanceof Error ? err.stack : err instanceof Error ? err.message : err);
  process.exit(1);
});
