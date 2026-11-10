import proj4 from 'proj4';
import type { MultiPolygon, Polygon, Position } from 'geojson';

// SIRGAS 2000 / UTM 23S (EPSG:31983), sistema dos GeoJSON da GeoSampa. Mesma definição da antiga API Express.
const EPSG_31983 = '+proj=utm +zone=23 +south +ellps=GRS80 +units=m +no_defs';
const toWgs84 = proj4(EPSG_31983, proj4.WGS84);

/** Remove vértices repetidos em sequência e garante o anel fechado. */
export function cleanRing(ring: Position[]): Position[] {
  const cleaned: Position[] = [];
  for (const p of ring) {
    const prev = cleaned[cleaned.length - 1];
    if (!prev || prev[0] !== p[0] || prev[1] !== p[1]) cleaned.push(p);
  }
  const first = cleaned[0];
  const last = cleaned[cleaned.length - 1];
  if (first && (first[0] !== last[0] || first[1] !== last[1])) cleaned.push([first[0], first[1]]);
  return cleaned;
}

function convertRing(ring: Position[]): Position[] {
  return cleanRing(ring.map(([x, y]) => toWgs84.forward([x, y]) as Position));
}

/** Converte Polygon/MultiPolygon de EPSG:31983 para WGS84 [lng, lat], sempre como MultiPolygon. */
export function toWgs84MultiPolygon(geometry: Polygon | MultiPolygon): MultiPolygon {
  const polygons = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;
  return {
    type: 'MultiPolygon',
    coordinates: polygons
      .map((poly) => poly.map(convertRing).filter((ring) => ring.length >= 4))
      .filter((poly) => poly.length > 0),
  };
}

const fmt = (p: Position) => `${p[0]} ${p[1]}`;
const ringWkt = (ring: Position[]) => `(${ring.map(fmt).join(',')})`;

/** EWKT aceito diretamente por colunas geometry do PostGIS (via PostgREST). */
export function multiPolygonToEwkt(geom: MultiPolygon): string {
  return `SRID=4326;MULTIPOLYGON(${geom.coordinates.map((poly) => `(${poly.map(ringWkt).join(',')})`).join(',')})`;
}

export function polygonToEwkt(ring: Position[]): string {
  return `SRID=4326;POLYGON(${ringWkt(cleanRing(ring))})`;
}
