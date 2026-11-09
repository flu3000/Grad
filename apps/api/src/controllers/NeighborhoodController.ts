import { Request, Response } from 'express';
import { Neighborhood } from '../models/Neighborhood';

function geoJsonToMapCoordinates(geometry: any) {

  const polygons: any[] = [];

  if (geometry.type === 'Polygon') {
    polygons.push(geometry.coordinates);
  }

  if (geometry.type === 'MultiPolygon') {
    geometry.coordinates.forEach((poly: any) => polygons.push(poly));
  }

  return polygons.map((polygon: any) =>
    polygon[0].map(([lng, lat]: number[]) => ({
      latitude: lat,
      longitude: lng
    }))
  );
}

export class NeighborhoodController {

  static async getAll(req: Request, res: Response) {

    const neighborhoods = await Neighborhood.find();

    const formatted = neighborhoods.map(n => ({
      id: n._id,
      name: n.name,
      polygons: geoJsonToMapCoordinates(n.geometry)
    }));

    res.json(formatted);
  }
}
