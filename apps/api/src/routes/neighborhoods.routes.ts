import { Router } from 'express';
import { NeighborhoodController } from '../controllers/NeighborhoodController';

const router = Router();

router.get('/getAll', NeighborhoodController.getAll);

export default router;
