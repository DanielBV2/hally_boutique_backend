import express from "express";
import cors from "cors";
import helmet from "helmet";
import swaggerUi from "swagger-ui-express";
import { env, corsOrigins } from "./config/env.js";
import { prisma } from "./config/prisma.js";
import { errorHandler } from "./middlewares/errorHandler.js";
import { apiLimiter } from "./middlewares/rateLimiter.js";
import { logger, requestLogger } from "./shared/utils/logger.js";
import { openapiDocument } from "./docs/openapi.js";
import { authRoutes } from "./modules/auth/auth.routes.js";
import { productRoutes } from "./modules/products/product.routes.js";
import { categoryRoutes } from "./modules/categories/category.routes.js";
import { cartRoutes } from "./modules/cart/cart.routes.js";
import { addressRoutes } from "./modules/addresses/address.routes.js";
import { orderRoutes } from "./modules/orders/order.routes.js";
import { paymentRoutes } from "./modules/payments/payment.routes.js";
import { metricsRoutes } from "./modules/metrics/metrics.routes.js";
import * as Sentry from "@sentry/node";

const app = express();

app.use(requestLogger);
app.use(helmet());
app.use(cors({ origin: corsOrigins, credentials: true }));
app.use(express.json({ limit: "10kb" }));
app.use("/api", apiLimiter);

app.get("/health", async (_req, res) => {
  const DB_PING_TIMEOUT_MS = 3000;

  let timer: NodeJS.Timeout | undefined;
  try {
    await Promise.race([
      prisma.$queryRaw`SELECT 1`,
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error("Database ping timeout")), DB_PING_TIMEOUT_MS);
      }),
    ]);
    res.status(200).json({ status: "ok", checks: { database: "ok" } });
  } catch (err) {
    logger.error({ err }, "[Health] Database ping falló");
    res.status(503).json({ status: "error", checks: { database: "unreachable" } });
  } finally {
    clearTimeout(timer);
  }
});

if (env.NODE_ENV !== "production") {
  app.use("/api/docs", swaggerUi.serve, swaggerUi.setup(openapiDocument));
  app.get("/api/docs.json", (_req, res) => {
    res.json(openapiDocument);
  });
}

app.use("/api/auth", authRoutes);
app.use("/api/products", productRoutes);
app.use("/api/categories", categoryRoutes);
app.use("/api/cart", cartRoutes);
app.use("/api/addresses", addressRoutes);
app.use("/api/orders", orderRoutes);
app.use("/api/payments", paymentRoutes);
app.use("/api/metrics", metricsRoutes);

Sentry.setupExpressErrorHandler(app);

app.use(errorHandler);

export { app };
