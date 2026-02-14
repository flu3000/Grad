type Position = [number, number];

function cleanRing(ring: Position[]): Position[] {
  const unique = new Map<string, Position>();

  for (const coord of ring) {
    const key = `${coord[0].toFixed(12)}_${coord[1].toFixed(12)}`;
    if (!unique.has(key)) {
      unique.set(key, coord);
    }
  }

  const cleaned = Array.from(unique.values());

  // precisa ter pelo menos 4 pontos
  if (cleaned.length < 4) {
    return ring;
  }

  // garantir fechamento do anel
  const first = cleaned[0];
  const last = cleaned[cleaned.length - 1];

  if (first[0] !== last[0] || first[1] !== last[1]) {
    cleaned.push(first);
  }

  return cleaned;
}

export function fixGeometry(geometry: any) {
  if (!geometry) return geometry;

  if (geometry.type === 'Polygon') {
    return {
      type: 'Polygon',
      coordinates: geometry.coordinates.map(cleanRing)
    };
  }

  if (geometry.type === 'MultiPolygon') {
    return {
      type: 'MultiPolygon',
      coordinates: geometry.coordinates.map((polygon: Position[][]) =>
        polygon.map(cleanRing)
      )
    };
  }

  return geometry;
}
