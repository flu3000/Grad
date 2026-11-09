import { Router } from "express";
import { AuthController } from "../controllers/AuthController";
import { authenticate } from "../middlewares/authenticate";

const router = Router();

// ======================
// LOGIN METHODS
// ======================

// entra sem conta
router.post("/anonymous", AuthController.anonymous);

// login social
router.post("/google", AuthController.google);
router.post("/apple", AuthController.apple);

// ======================
// SESSION
// ======================

router.post("/refresh", AuthController.refresh);
router.post("/logout", authenticate, AuthController.logout);

// ======================
// ACCOUNT LINK (upgrade de conta)
// ======================

router.post("/link/google", authenticate, AuthController.linkGoogle);
router.post("/link/apple", authenticate, AuthController.linkApple);

export default router;
