import fs from 'fs';
import path from 'path';
import type { Feature, FeatureCollection, MultiPolygon, Polygon } from 'geojson';
import { dataDir } from './paths';
import { toWgs84MultiPolygon } from './geometry';

export interface GeoSampaFeature<P> {
  properties: P;
  geometry: MultiPolygon; // já em WGS84
}

export function readGeoSampa<P>(file: 'distritos' | 'subprefeituras'): GeoSampaFeature<P>[] {
  const raw = JSON.parse(fs.readFileSync(path.join(dataDir(), 'geosampa', `${file}.geojson`), 'utf-8')) as FeatureCollection<
    Polygon | MultiPolygon,
    P
  >;
  return raw.features.map((f: Feature<Polygon | MultiPolygon, P>) => ({
    properties: f.properties,
    geometry: toWgs84MultiPolygon(f.geometry),
  }));
}
