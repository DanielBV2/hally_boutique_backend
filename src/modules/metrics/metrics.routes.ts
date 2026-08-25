import { Router } from "express";
import { authMiddleware } from "../../middlewares/authMiddleware.js";
import { roleMiddleware } from "../../middlewares/roleMiddleware.js";
import { container } from "../../di/container.js";

const { metricsController } = container;

const router = Router();

router.get("/dashboard", authMiddleware, roleMiddleware("ADMIN"), metricsController.getDashboard);

export { router as metricsRoutes };
