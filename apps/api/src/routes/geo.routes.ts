import { Router } from "express";
import { locatePoint } from "../controllers/GeoController";

const router = Router();

router.post("/locate", locatePoint);

export default router;
