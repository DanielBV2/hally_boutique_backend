import { Router } from "express";
import { validateSchemaMiddleware } from "../../middlewares/validateSchemaMiddleware.js";
import { authMiddleware } from "../../middlewares/authMiddleware.js";
import { registerSchema, loginSchema } from "./auth.schema.js";
import { AuthController } from "./auth.controller.js";
import { PrismaAuthRepository } from "./auth.repository.js";
import { AuthServiceImpl } from "./auth.service.js";
import { prisma } from "../../config/prisma.js";

const authRepository = new PrismaAuthRepository(prisma);
const authService = new AuthServiceImpl(authRepository);
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

router.get("/me", authMiddleware, authController.getProfile);

export { router as authRoutes };
