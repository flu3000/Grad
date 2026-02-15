import { Request, Response } from "express";
import { Neighborhood } from "../models/Neighborhood";
import { Subprefecture } from "../models/Subprefecture";

export async function locatePoint(req: Request, res: Response) {
  try {
    const { lat, lng } = req.body;

    if (!lat || !lng)
      return res.status(400).json({ error: "Lat/Lng obrigatórios" });

    const neighborhood = await Neighborhood.findOne({
        geometry: {
            $geoIntersects: {
            $geometry: {
                type: "Point",
                coordinates: [lng, lat]
            }
            }
        }
        }).populate<{ subprefecture: typeof Subprefecture }>("subprefecture");

        if (!neighborhood) {
        return res.status(404).json({ error: "Local não encontrado" });
        }

        return res.json({
        district: neighborhood.name,
        subprefecture: neighborhood.subprefecture.name,
        city: neighborhood.city,
        state: neighborhood.state
        });

  } catch (err) {
    res.status(500).json({ error: "Erro interno" });
  }
}
