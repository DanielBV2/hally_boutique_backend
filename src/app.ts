import express from "express";
import cors from "cors";
import helmet from "helmet";
import { env, corsOrigins } from "./config/env.js";
import { errorHandler } from "./middlewares/errorHandler.js";
import { apiLimiter } from "./middlewares/rateLimiter.js";
import { requestLogger } from "./shared/utils/logger.js";
import { authRoutes } from "./modules/auth/auth.routes.js";
import { productRoutes } from "./modules/products/product.routes.js";
import { categoryRoutes } from "./modules/categories/category.routes.js";
import { cartRoutes } from "./modules/cart/cart.routes.js";
import { addressRoutes } from "./modules/addresses/address.routes.js";
import { orderRoutes } from "./modules/orders/order.routes.js";
import { paymentRoutes } from "./modules/payments/payment.routes.js";
import { metricsRoutes } from "./modules/metrics/metrics.routes.js";

const app = express();

app.use(requestLogger);
app.use(helmet());
app.use(cors({ origin: corsOrigins, credentials: true }));
app.use(express.json({ limit: "10kb" }));
app.use("/api", apiLimiter);

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.use("/api/auth", authRoutes);
app.use("/api/products", productRoutes);
app.use("/api/categories", categoryRoutes);
app.use("/api/cart", cartRoutes);
app.use("/api/addresses", addressRoutes);
app.use("/api/orders", orderRoutes);
app.use("/api/payments", paymentRoutes);
app.use("/api/metrics", metricsRoutes);

app.use(errorHandler);

export { app };
