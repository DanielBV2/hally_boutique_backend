import { Router } from "express";
import { validateSchemaMiddleware } from "../../middlewares/validateSchemaMiddleware.js";
import { authMiddleware } from "../../middlewares/authMiddleware.js";
import { roleMiddleware } from "../../middlewares/roleMiddleware.js";
import {
  listProductsQuerySchema,
  productBySlugParamsSchema,
  createProductSchema,
  productByIdParamsSchema,
  updateProductSchema,
  addProductImageSchema,
  productImageParamsSchema,
} from "./product.schema.js";
import * as productController from "./product.controller.js";

const router = Router();

// ─── Public ────────────────────────────────────────────────────

router.get(
  "/",
  validateSchemaMiddleware(listProductsQuerySchema, "query"),
  productController.listProducts,
);

router.get(
  "/:slug",
  validateSchemaMiddleware(productBySlugParamsSchema, "params"),
  productController.getProductBySlug,
);

// ─── Admin (auth + role required) ──────────────────────────────

router.post(
  "/",
  authMiddleware,
  roleMiddleware("ADMIN"),
  validateSchemaMiddleware(createProductSchema, "body"),
  productController.createProduct,
);

router.patch(
  "/:id",
  authMiddleware,
  roleMiddleware("ADMIN"),
  validateSchemaMiddleware(productByIdParamsSchema, "params"),
  validateSchemaMiddleware(updateProductSchema, "body"),
  productController.updateProduct,
);

router.delete(
  "/:id",
  authMiddleware,
  roleMiddleware("ADMIN"),
  validateSchemaMiddleware(productByIdParamsSchema, "params"),
  productController.deleteProduct,
);

router.post(
  "/:id/images",
  authMiddleware,
  roleMiddleware("ADMIN"),
  validateSchemaMiddleware(productByIdParamsSchema, "params"),
  validateSchemaMiddleware(addProductImageSchema, "body"),
  productController.addImage,
);

router.delete(
  "/:id/images/:imageId",
  authMiddleware,
  roleMiddleware("ADMIN"),
  validateSchemaMiddleware(productImageParamsSchema, "params"),
  productController.removeImage,
);

export { router as productRoutes };
