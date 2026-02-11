import { Router } from 'express';
import { AuthController } from '../controllers/AuthController';

const router = Router();

router.post('/register', AuthController.register);
router.post('/login', AuthController.login);
router.post('/refresh', AuthController.refresh);

export default router;
