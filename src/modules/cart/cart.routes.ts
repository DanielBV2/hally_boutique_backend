import { Router } from "express";
import { validateSchemaMiddleware } from "../../middlewares/validateSchemaMiddleware.js";
import { authMiddleware } from "../../middlewares/authMiddleware.js";
import { addCartItemSchema, updateCartItemSchema, cartItemParamsSchema } from "./cart.schema.js";
import { container } from "../../di/container.js";

const { cartController } = container;

const router = Router();

router.use(authMiddleware);

router.get("/", cartController.getCart);

router.post("/items", validateSchemaMiddleware(addCartItemSchema, "body"), cartController.addItem);

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
