import { Router } from "express";
import { validateSchemaMiddleware } from "../../middlewares/validateSchemaMiddleware.js";
import { authMiddleware } from "../../middlewares/authMiddleware.js";
import {
  addCartItemSchema,
  updateCartItemSchema,
  cartItemParamsSchema,
} from "./cart.schema.js";
import { CartController } from "./cart.controller.js";
import { PrismaCartRepository } from "./cart.repository.js";
import { CartServiceImpl } from "./cart.service.js";
import { prisma } from "../../config/prisma.js";

const cartRepository = new PrismaCartRepository(prisma);
const cartService = new CartServiceImpl(cartRepository);
const cartController = new CartController(cartService);

const router = Router();

router.use(authMiddleware);

router.get("/", cartController.getCart);

router.post(
  "/items",
  validateSchemaMiddleware(addCartItemSchema, "body"),
  cartController.addItem,
);

router.patch(
  "/items/:itemId",
  validateSchemaMiddleware(cartItemParamsSchema, "params"),
  validateSchemaMiddleware(updateCartItemSchema, "body"),
  cartController.updateItemQuantity,
);

router.delete(
  "/items/:itemId",
  validateSchemaMiddleware(cartItemParamsSchema, "params"),
  cartController.removeItem,
);

router.delete("/", cartController.clearCart);

export { router as cartRoutes };
