import { Router } from "express";
import { authMiddleware } from "../../middlewares/authMiddleware.js";
import { roleMiddleware } from "../../middlewares/roleMiddleware.js";
import { MetricsController } from "./metrics.controller.js";
import { MetricsServiceImpl } from "./metrics.service.js";
import { PrismaMetricsRepository } from "./metrics.repository.js";
import { prisma } from "../../config/prisma.js";

const metricsRepository = new PrismaMetricsRepository(prisma);
const metricsService = new MetricsServiceImpl(metricsRepository);
const metricsController = new MetricsController(metricsService);

const router = Router();

router.get(
  "/dashboard",
  authMiddleware,
  roleMiddleware("ADMIN"),
  metricsController.getDashboard,
);

export { router as metricsRoutes };
