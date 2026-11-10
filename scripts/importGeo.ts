/**
 * Importa subprefeituras e distritos de São Paulo (GeoSampa, EPSG:31983) para o Supabase em WGS84.
 *
 *   npm run import:geo              → simulação: converte e mostra o resumo, sem gravar
 *   npm run import:geo -- --gravar  → grava (upsert) em public.subprefectures e public.districts
 */
import { readGeoSampa } from './src/lib/city';
import { multiPolygonToEwkt } from './src/lib/geometry';
import { arg } from './src/lib/paths';
import { adminClient, upsertInBatches } from './src/lib/supabase';

interface SubprefeituraProps {
  cd_identificador_subprefeitura: number;
  cd_subprefeitura: string;
  nm_subprefeitura: string;
  sg_subprefeitura?: string;
  qt_area_quilometro?: number;
}

interface DistritoProps {
  cd_identificador_distrito: number;
  cd_identificador_subprefeitura: number;
  cd_distrito_municipal: string;
  nm_distrito_municipal: string;
  sg_distrito_municipal?: string;
  qt_area_quilometro?: number;
}

async function main() {
  const gravar = arg('gravar') === 'true';

  const subprefectures = readGeoSampa<SubprefeituraProps>('subprefeituras').map(({ properties: p, geometry }) => ({
    id: p.cd_identificador_subprefeitura,
    code: p.cd_subprefeitura,
    name: p.nm_subprefeitura,
    acronym: p.sg_subprefeitura || null,
    area_km2: p.qt_area_quilometro ?? null,
    geom: multiPolygonToEwkt(geometry),
  }));

  // Atenção: no arquivo de distritos, `cd_identificador_subprefeitura` guarda o CÓDIGO da subprefeitura
  // (`cd_subprefeitura`, ex.: 9 = "09" = Sé), não o `cd_identificador_subprefeitura` dela.
  const subIdByCode = new Map(subprefectures.map((s) => [Number(s.code), s.id]));
  const districts = readGeoSampa<DistritoProps>('distritos').map(({ properties: p, geometry }) => ({
    id: p.cd_identificador_distrito,
    code: p.cd_distrito_municipal,
    name: p.nm_distrito_municipal,
    acronym: p.sg_distrito_municipal || null,
    subprefecture_id: subIdByCode.get(Number(p.cd_identificador_subprefeitura)) ?? -1,
    area_km2: p.qt_area_quilometro ?? null,
    geom: multiPolygonToEwkt(geometry),
  }));

  const orphans = districts.filter((d) => d.subprefecture_id === -1);
  if (orphans.length) throw new Error(`Distritos sem subprefeitura: ${orphans.map((d) => d.name).join(', ')}`);

  const mb = (rows: { geom: string }[]) => (rows.reduce((n, r) => n + r.geom.length, 0) / 1e6).toFixed(1);
  console.log(`Subprefeituras: ${subprefectures.length} (${mb(subprefectures)} MB de geometria)`);
  console.log(`Distritos:      ${districts.length} (${mb(districts)} MB de geometria)`);

  if (!gravar) {
    console.log('\nSimulação concluída. Rode com --gravar para enviar ao Supabase.');
    return;
  }

  const client = adminClient();
  await upsertInBatches(client, 'subprefectures', subprefectures, 'id', 8);
  await upsertInBatches(client, 'districts', districts, 'id', 8);
  console.log('\nDistritos e subprefeituras gravados.');
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
