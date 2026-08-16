import { Router } from "express";
import { validateSchemaMiddleware } from "../../middlewares/validateSchemaMiddleware.js";
import { authMiddleware } from "../../middlewares/authMiddleware.js";
import { roleMiddleware } from "../../middlewares/roleMiddleware.js";
import {
  loginLimiter,
  registerLimiter,
  forgotPasswordLimiter,
} from "../../middlewares/rateLimiter.js";
import {
  registerSchema,
  loginSchema,
  refreshTokenSchema,
  adminUsersQuerySchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  updateProfileSchema,
  changePasswordSchema,
} from "./auth.schema.js";
import { container } from "../../di/container.js";

const { authController } = container;

const router = Router();

router.post(
  "/register",
  registerLimiter,
  validateSchemaMiddleware(registerSchema),
  authController.register,
);

router.post(
  "/login",
  loginLimiter,
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
  forgotPasswordLimiter,
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

router.patch(
  "/me",
  authMiddleware,
  validateSchemaMiddleware(updateProfileSchema),
  authController.updateProfile,
);

router.patch(
  "/me/password",
  authMiddleware,
  validateSchemaMiddleware(changePasswordSchema),
  authController.changePassword,
);

export { router as authRoutes };
