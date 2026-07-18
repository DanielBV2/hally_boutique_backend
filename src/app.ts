import express from "express";
import cors from "cors";
import { env } from "./config/env.js";
import { errorHandler } from "./middlewares/errorHandler.js";
import { authRoutes } from "./modules/auth/auth.routes.js";
import { productRoutes } from "./modules/products/product.routes.js";
import { categoryRoutes } from "./modules/categories/category.routes.js";
import { cartRoutes } from "./modules/cart/cart.routes.js";
import { addressRoutes } from "./modules/addresses/address.routes.js";
import { orderRoutes } from "./modules/orders/order.routes.js";

const app = express();

app.use(cors({ origin: env.CORS_ORIGIN, credentials: true }));
app.use(express.json({ limit: "10kb" }));

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.use("/api/auth", authRoutes);
app.use("/api/products", productRoutes);
app.use("/api/categories", categoryRoutes);
app.use("/api/cart", cartRoutes);
app.use("/api/addresses", addressRoutes);
app.use("/api/orders", orderRoutes);

app.use(errorHandler);

export { app };
