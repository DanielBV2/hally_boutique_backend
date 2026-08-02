import { Router } from "express";
import { validateSchemaMiddleware } from "../../middlewares/validateSchemaMiddleware.js";
import { authMiddleware } from "../../middlewares/authMiddleware.js";
import { roleMiddleware } from "../../middlewares/roleMiddleware.js";
import {
  registerSchema,
  loginSchema,
  refreshTokenSchema,
  adminUsersQuerySchema,
  forgotPasswordSchema,
  resetPasswordSchema,
} from "./auth.schema.js";
import { AuthController } from "./auth.controller.js";
import { PrismaAuthRepository } from "./auth.repository.js";
import { PrismaRefreshTokenRepository } from "./refresh-token.repository.js";
import { PrismaPasswordResetTokenRepository } from "./password-reset-token.repository.js";
import { AuthServiceImpl } from "./auth.service.js";
import { prisma } from "../../config/prisma.js";

const authRepository = new PrismaAuthRepository(prisma);
const refreshTokenRepository = new PrismaRefreshTokenRepository(prisma);
const passwordResetTokenRepository = new PrismaPasswordResetTokenRepository(prisma);
const authService = new AuthServiceImpl(
  authRepository,
  refreshTokenRepository,
  passwordResetTokenRepository,
);
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

router.post(
  "/forgot-password",
  validateSchemaMiddleware(forgotPasswordSchema),
  authController.forgotPassword,
);

router.post(
  "/reset-password",
  validateSchemaMiddleware(resetPasswordSchema),
  authController.resetPassword,
);

router.get(
  "/admin/all",
  authMiddleware,
  roleMiddleware("ADMIN"),
  validateSchemaMiddleware(adminUsersQuerySchema, "query"),
  authController.listUsersAdmin,
);

router.get("/me", authMiddleware, authController.getProfile);

export { router as authRoutes };
