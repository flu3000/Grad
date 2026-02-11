import { Router } from 'express';
import { authMiddleware } from '../middlewares/auth.middleware';
import { NeighborhoodController } from '../controllers/NeighborhoodController';

const router = Router();

router.use(authMiddleware);

router.get('/', NeighborhoodController.list);
router.post('/', NeighborhoodController.create);

export default router;
