/**
 * Importa as unidades de segurança pública da GeoSampa (Polícia Militar, Polícia Civil, GCM e Bombeiros) para
 * public.security_units. Os arquivos ficam em data/geosampa/seguranca/ (EPSG:31983).
 *
 *   npm run import:postos                  → simulação: resumo e exemplos, sem gravar
 *   npm run import:postos -- --gravar      → grava (upsert) no Supabase com a chave secreta de scripts/.env
 *   npm run import:postos -- --sql=arq.sql → gera um INSERT ... ON CONFLICT para rodar no SQL Editor do Supabase
 *   npm run import:postos -- --baixar      → baixa de novo as camadas do WFS da GeoSampa antes de importar
 */
import fs from 'fs';
import path from 'path';
import booleanPointInPolygon from '@turf/boolean-point-in-polygon';
import { point } from '@turf/helpers';
import type { FeatureCollection, Point } from 'geojson';
import { readGeoSampa } from './src/lib/city';
import { pointToWgs84 } from './src/lib/geometry';
import { arg, dataDir } from './src/lib/paths';
import { adminClient, upsertInBatches } from './src/lib/supabase';

type Tipo = 'policia_militar' | 'policia_civil' | 'gcm' | 'bombeiros';

const CAMADAS: Record<Tipo, { arquivo: string; camada: string }> = {
  policia_militar: { arquivo: 'policia_militar', camada: 'equipamento_policia_militar' },
  policia_civil: { arquivo: 'policia_civil', camada: 'equipamento_policia_civil' },
  gcm: { arquivo: 'guarda_civil_metropolitana', camada: 'equipamento_guarda_civil_metropolitana' },
  bombeiros: { arquivo: 'bombeiros', camada: 'equipamento_bombeiros' },
};

interface Props {
  cd_identificador: number;
  nm_equipamento: string | null;
  tx_endereco_equipamento: string | null;
  nm_bairro_equipamento: string | null;
  cd_cep_equipamento: string | null;
  tx_numero_telefone: string | null;
}

const MINUSCULAS = new Set(['DE', 'DA', 'DO', 'DAS', 'DOS', 'E']);
const SIGLAS = new Set(['DP', 'GCM', 'BPM', 'CPA', 'PM', 'SP', 'DDM', 'DEIC', 'DHPP', 'GOE', 'ROTA', 'COE', 'GATE', 'CPTRAN', 'CEU', 'USP']);

/**
 * Padroniza a caixa: palavras TODAS EM MAIÚSCULAS viram "Capitalizadas", conectivos (de, da, do…) ficam minúsculos,
 * e siglas conhecidas, números romanos e termos com número ou barra (BPM/M, CPA/M-1, 22°) ficam como estão.
 * Palavras que já têm minúsculas são mantidas. `inicio` indica se a primeira palavra é o começo da frase.
 */
export function arrumarCaixa(texto: string, inicio = true): string {
  return texto
    .trim()
    .replace(/\s+/g, ' ')
    .split(' ')
    .map((p, i) => {
      if (/[a-zà-ÿ]/.test(p) || /\d|\//.test(p)) return p;
      const letras = p.replace(/[^A-ZÀ-Ý]/g, '');
      if (SIGLAS.has(letras) || /^[IVX]+$/.test(letras)) return p;
      if ((i > 0 || !inicio) && MINUSCULAS.has(letras)) return p.toLowerCase();
      return p.charAt(0) + p.slice(1).toLowerCase();
    })
    .join(' ');
}

const LOGRADOUROS: Record<string, string> = {
  R: 'Rua', 'R.': 'Rua', RUA: 'Rua', AV: 'Av.', 'AV.': 'Av.', AVENIDA: 'Avenida', AL: 'Alameda', 'AL.': 'Alameda',
  PCA: 'Praça', 'PÇA': 'Praça', PC: 'Praça', EST: 'Estrada', 'EST.': 'Estrada', TV: 'Travessa', LGO: 'Largo', VD: 'Viaduto',
};

/** Endereço com o tipo de logradouro por extenso e a caixa padronizada. */
export function arrumarEndereco(endereco: string): string {
  const [primeira, ...resto] = endereco.trim().split(/\s+/);
  const tipo = LOGRADOUROS[primeira.toUpperCase()];
  // A base às vezes repete o tipo: "R RUA NHATUMANI", "AV AV IMPERADOR", "AV. AVENIDA INCONFIDÊNCIA".
  if (tipo && resto.length > 1 && LOGRADOUROS[resto[0].toUpperCase()] && /^(Rua|Av\.|Avenida)$/.test(LOGRADOUROS[resto[0].toUpperCase()])) resto.shift();
  return tipo ? `${tipo} ${arrumarCaixa(resto.join(' '), false)}` : arrumarCaixa(endereco);
}

function nomeDaUnidade(tipo: Tipo, bruto: string): string {
  const nome = bruto.trim().replace(/\s*-\s*$/, '');
  if (tipo === 'policia_militar') return arrumarCaixa(nome).replace(/^(\d+) Cia\b/, '$1ª Cia');
  if (tipo === 'bombeiros') return `Bombeiros – ${arrumarCaixa(nome.replace(/^SP\s*-\s*/i, ''))}`;
  if (tipo === 'gcm') return `GCM – ${arrumarCaixa(nome)}`;
  return arrumarCaixa(nome);
}

function formatarCep(cep: string | null): string | null {
  const d = (cep ?? '').replace(/\D/g, '');
  return d.length === 8 ? `${d.slice(0, 5)}-${d.slice(5)}` : null;
}

async function baixar(dir: string) {
  for (const { arquivo, camada } of Object.values(CAMADAS)) {
    const url = `https://wfs.geosampa.prefeitura.sp.gov.br/geoserver/ows?service=WFS&version=2.0.0&request=GetFeature&typeNames=geoportal:${camada}&outputFormat=application/json`;
    const resp = await fetch(url);
    if (!resp.ok) throw new Error(`GeoSampa respondeu ${resp.status} para ${camada}`);
    fs.writeFileSync(path.join(dir, `${arquivo}.geojson`), await resp.text());
    console.log(`Baixado: ${camada}`);
  }
}

const sqlTexto = (v: string | null) => (v == null ? 'null' : `'${v.replace(/'/g, "''")}'`);

async function main() {
  const dir = path.join(dataDir(), 'geosampa', 'seguranca');
  if (arg('baixar') === 'true') await baixar(dir);

  const distritos = readGeoSampa<{ cd_identificador_distrito: number }>('distritos');
  const distritoDe = (lng: number, lat: number) =>
    distritos.find((d) => booleanPointInPolygon(point([lng, lat]), d.geometry))?.properties.cd_identificador_distrito ?? null;

  const linhas = (Object.keys(CAMADAS) as Tipo[]).flatMap((tipo) => {
    const g = JSON.parse(fs.readFileSync(path.join(dir, `${CAMADAS[tipo].arquivo}.geojson`), 'utf-8')) as FeatureCollection<Point, Props>;
    return g.features
      .filter((f) => f.geometry && f.properties.nm_equipamento)
      .map((f) => {
        const [lng, lat] = pointToWgs84(f.geometry.coordinates);
        const p = f.properties;
        return {
          id: p.cd_identificador,
          kind: tipo,
          name: nomeDaUnidade(tipo, p.nm_equipamento!),
          address: p.tx_endereco_equipamento ? arrumarEndereco(p.tx_endereco_equipamento) : null,
          neighborhood: p.nm_bairro_equipamento ? arrumarCaixa(p.nm_bairro_equipamento) : null,
          postal_code: formatarCep(p.cd_cep_equipamento),
          phone: p.tx_numero_telefone?.trim() || null,
          district_id: distritoDe(lng, lat),
          source: 'geosampa',
          geom: `SRID=4326;POINT(${lng} ${lat})`,
        };
      });
  });

  const porTipo = linhas.reduce<Record<string, number>>((m, l) => ((m[l.kind] = (m[l.kind] ?? 0) + 1), m), {});
  console.log('Unidades por tipo:', porTipo);
  console.log(`Sem distrito (fora dos 96 distritos): ${linhas.filter((l) => l.district_id == null).length}`);
  console.log('Exemplos:', linhas.filter((_, i) => i % 60 === 0).map((l) => `${l.name} | ${l.address}`));

  const sql = arg('sql');
  if (sql) {
    // Versão compacta para o SQL Editor: coordenadas em lng/lat e distrito calculado pelo próprio banco.
    const valores = linhas
      .map((l) => {
        const [lng, lat] = l.geom.replace(/^SRID=4326;POINT\(|\)$/g, '').split(' ').map(Number);
        return `(${l.id},'${l.kind}',${sqlTexto(l.name)},${sqlTexto(l.address)},${sqlTexto(l.neighborhood)},${sqlTexto(l.postal_code)},${sqlTexto(l.phone)},${lng.toFixed(6)},${lat.toFixed(6)})`;
      })
      .join(',\n');
    fs.writeFileSync(
      sql,
      `insert into public.security_units (id, kind, name, address, neighborhood, postal_code, phone, district_id, source, geom)\n` +
        `select v.id, v.kind, v.name, v.address, v.neighborhood, v.postal_code, v.phone,\n` +
        `  (select d.id from public.districts d where extensions.st_covers(d.geom, p.pt) limit 1), 'geosampa', p.pt\n` +
        `from (values\n${valores}\n) as v(id, kind, name, address, neighborhood, postal_code, phone, lng, lat)\n` +
        `cross join lateral (select extensions.st_setsrid(extensions.st_makepoint(v.lng, v.lat), 4326) as pt) p\n` +
        `on conflict (id) do update set kind = excluded.kind, name = excluded.name, address = excluded.address,\n` +
        `  neighborhood = excluded.neighborhood, postal_code = excluded.postal_code,\n` +
        `  phone = coalesce(excluded.phone, security_units.phone), district_id = excluded.district_id, geom = excluded.geom;\n`,
    );
    console.log(`SQL gerado em ${sql}`);
  }

  if (arg('gravar') !== 'true') {
    if (!sql) console.log('\nSimulação concluída. Rode com --gravar para enviar ao Supabase.');
    return;
  }
  await upsertInBatches(adminClient(), 'security_units', linhas, 'id', 200);
  console.log('\nUnidades gravadas.');
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
