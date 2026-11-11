import booleanPointInPolygon from '@turf/boolean-point-in-polygon';
import { point } from '@turf/helpers';
import type { MultiPolygon } from 'geojson';
import { readGeoSampa } from './city';
import { normalizarBairro } from './semLocalizacao';

type BBox = [number, number, number, number];

function bboxOf(geom: MultiPolygon): BBox {
  let [minX, minY, maxX, maxY] = [Infinity, Infinity, -Infinity, -Infinity];
  for (const poly of geom.coordinates)
    for (const [x, y] of poly[0]) {
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
  return [minX, minY, maxX, maxY];
}

export interface Municipio {
  /** Nome normalizado (normalizarBairro) do distrito que contém o ponto, ou null se estiver fora da capital. */
  distritoDe(lat: number, lng: number): string | null;
  nomes: Set<string>;
}

/** Os 96 distritos da GeoSampa (WGS84), com teste rápido por caixa envolvente antes do ponto-no-polígono. */
export function carregarMunicipio(): Municipio {
  const distritos = readGeoSampa<{ nm_distrito_municipal: string }>('distritos').map((f) => ({
    nome: normalizarBairro(f.properties.nm_distrito_municipal),
    geometry: f.geometry,
    bbox: bboxOf(f.geometry),
  }));
  const city = distritos.reduce<BBox>(
    (b, d) => [Math.min(b[0], d.bbox[0]), Math.min(b[1], d.bbox[1]), Math.max(b[2], d.bbox[2]), Math.max(b[3], d.bbox[3])],
    [Infinity, Infinity, -Infinity, -Infinity],
  );
  return {
    nomes: new Set(distritos.map((d) => d.nome)),
    distritoDe(lat, lng) {
      if (lng < city[0] || lng > city[2] || lat < city[1] || lat > city[3]) return null;
      const pt = point([lng, lat]);
      for (const d of distritos)
        if (lng >= d.bbox[0] && lng <= d.bbox[2] && lat >= d.bbox[1] && lat <= d.bbox[3] && booleanPointInPolygon(pt, d.geometry)) return d.nome;
      return null;
    },
  };
}
