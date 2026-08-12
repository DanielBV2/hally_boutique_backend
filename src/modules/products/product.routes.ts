import { Router } from "express";
import { validateSchemaMiddleware } from "../../middlewares/validateSchemaMiddleware.js";
import { authMiddleware } from "../../middlewares/authMiddleware.js";
import { roleMiddleware } from "../../middlewares/roleMiddleware.js";
import {
  createProductSchema,
  updateProductSchema,
  listProductsQuerySchema,
  adminProductsQuerySchema,
  addProductImageSchema,
  idParamsSchema,
  slugParamsSchema,
  imageParamsSchema,
} from "./product.schema.js";
import {
  createVariantSchema,
  updateVariantSchema,
  productIdParamsSchema,
  variantParamsSchema,
} from "./variant.schema.js";
import { container } from "../../di/container.js";

const { productController, variantController } = container;

const router = Router();

router.get(
  "/",
  validateSchemaMiddleware(listProductsQuerySchema, "query"),
  productController.list,
);

router.get(
  "/admin/all",
  authMiddleware,
  roleMiddleware("ADMIN"),
  validateSchemaMiddleware(adminProductsQuerySchema, "query"),
  productController.listAdmin,
);

router.get(
  "/:slug",
  validateSchemaMiddleware(slugParamsSchema, "params"),
  productController.getBySlug,
);

router.post(
  "/",
  authMiddleware,
  roleMiddleware("ADMIN"),
  validateSchemaMiddleware(createProductSchema, "body"),
  productController.create,
);

router.patch(
  "/:id",
  authMiddleware,
  roleMiddleware("ADMIN"),
  validateSchemaMiddleware(idParamsSchema, "params"),
  validateSchemaMiddleware(updateProductSchema, "body"),
  productController.update,
);

router.delete(
  "/:id",
  authMiddleware,
  roleMiddleware("ADMIN"),
  validateSchemaMiddleware(idParamsSchema, "params"),
  productController.remove,
);

router.post(
  "/:id/images",
  authMiddleware,
  roleMiddleware("ADMIN"),
  validateSchemaMiddleware(idParamsSchema, "params"),
  validateSchemaMiddleware(addProductImageSchema, "body"),
  productController.addImage,
);

router.delete(
  "/:id/images/:imageId",
  authMiddleware,
  roleMiddleware("ADMIN"),
  validateSchemaMiddleware(imageParamsSchema, "params"),
  productController.removeImage,
);

router.get(
  "/:productId/variants",
  authMiddleware,
  roleMiddleware("ADMIN"),
  validateSchemaMiddleware(productIdParamsSchema, "params"),
  variantController.listByProduct,
);

router.post(
  "/:productId/variants",
  authMiddleware,
  roleMiddleware("ADMIN"),
  validateSchemaMiddleware(productIdParamsSchema, "params"),
  validateSchemaMiddleware(createVariantSchema, "body"),
  variantController.create,
);

router.patch(
  "/:productId/variants/:variantId",
  authMiddleware,
  roleMiddleware("ADMIN"),
  validateSchemaMiddleware(variantParamsSchema, "params"),
  validateSchemaMiddleware(updateVariantSchema, "body"),
  variantController.update,
);

router.delete(
  "/:productId/variants/:variantId",
  authMiddleware,
  roleMiddleware("ADMIN"),
  validateSchemaMiddleware(variantParamsSchema, "params"),
  variantController.remove,
);

export { router as productRoutes };
