import { Router } from "express";
import { validateSchemaMiddleware } from "../../middlewares/validateSchemaMiddleware.js";
import { authMiddleware } from "../../middlewares/authMiddleware.js";
import {
  registerSchema,
  loginSchema,
  refreshTokenSchema,
} from "./auth.schema.js";
import { AuthController } from "./auth.controller.js";
import { PrismaAuthRepository } from "./auth.repository.js";
import { PrismaRefreshTokenRepository } from "./refresh-token.repository.js";
import { AuthServiceImpl } from "./auth.service.js";
import { prisma } from "../../config/prisma.js";

const authRepository = new PrismaAuthRepository(prisma);
const refreshTokenRepository = new PrismaRefreshTokenRepository(prisma);
const authService = new AuthServiceImpl(authRepository, refreshTokenRepository);
const authController = new AuthController(authService);

const router = Router();

router.post(
  "/register",
  validateSchemaMiddleware(registerSchema),
  authController.register,
);

router.post(
  "/login",
  validateSchemaMiddleware(loginSchema),
  authController.login,
);

router.post(
  "/refresh",
  validateSchemaMiddleware(refreshTokenSchema),
  authController.refresh,
);

router.post(
  "/logout",
  validateSchemaMiddleware(refreshTokenSchema),
  authController.logout,
);

router.get("/me", authMiddleware, authController.getProfile);

export { router as authRoutes };
