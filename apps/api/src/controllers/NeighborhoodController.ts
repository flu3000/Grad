import { Request, Response } from 'express';
import { Neighborhood } from '../models/Neighborhood';

export class NeighborhoodController {
  static async list(req: Request, res: Response) {
    const neighborhoods = await Neighborhood.find();
    res.json(neighborhoods);
  }

  static async create(req: Request, res: Response) {
    const neighborhood = await Neighborhood.create(req.body);
    res.status(201).json(neighborhood);
  }
}
