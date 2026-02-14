import proj4 from 'proj4';

const source = '+proj=utm +zone=23 +south +ellps=GRS80 +units=m +no_defs';
const dest = proj4.WGS84;

/**
 * Remove vértices duplicados consecutivos
 */
function removeDuplicateVertices(ring: number[][]) {
  const cleaned: number[][] = [];

  for (let i = 0; i < ring.length; i++) {
    const current = ring[i];
    const previous = ring[i - 1];

    if (!previous || current[0] !== previous[0] || current[1] !== previous[1]) {
      cleaned.push(current);
    }
  }

  return cleaned;
}

/**
 * Garante que o polígono esteja fechado
 */
function closeRing(ring: number[][]) {
  const first = ring[0];
  const last = ring[ring.length - 1];

  if (first[0] !== last[0] || first[1] !== last[1]) {
    ring.push(first);
  }

  return ring;
}

function convertRing(ring: number[][]) {
  const converted = ring.map(([x, y]) => {
    const [lng, lat] = proj4(source, dest, [x, y]);
    return [lng, lat];
  });

  const cleaned = removeDuplicateVertices(converted);

  return closeRing(cleaned);
}

export function convertGeometry(geometry: any) {
  if (geometry.type === 'Polygon') {
    return {
      type: 'Polygon',
      coordinates: geometry.coordinates.map(convertRing)
    };
  }

  if (geometry.type === 'MultiPolygon') {
    return {
      type: 'MultiPolygon',
      coordinates: geometry.coordinates.map((polygon: any) =>
        polygon.map(convertRing)
      )
    };
  }

  return geometry;
}
