import { Router } from "express";
import { validateSchemaMiddleware } from "../../middlewares/validateSchemaMiddleware.js";
import { authMiddleware } from "../../middlewares/authMiddleware.js";
import { roleMiddleware } from "../../middlewares/roleMiddleware.js";
import {
  createProductSchema,
  updateProductSchema,
  listProductsQuerySchema,
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
import { ProductController } from "./product.controller.js";
import { PrismaProductRepository } from "./product.repository.js";
import { ProductServiceImpl } from "./product.service.js";
import { PrismaVariantRepository } from "./variant.repository.js";
import { VariantServiceImpl } from "./variant.service.js";
import { VariantController } from "./variant.controller.js";
import { prisma } from "../../config/prisma.js";

const productRepository = new PrismaProductRepository(prisma);
const productService = new ProductServiceImpl(productRepository);
const productController = new ProductController(productService);

const variantRepository = new PrismaVariantRepository(prisma);
const variantService = new VariantServiceImpl(variantRepository, productRepository);
const variantController = new VariantController(variantService);

const router = Router();

router.get(
  "/",
  validateSchemaMiddleware(listProductsQuerySchema, "query"),
  productController.list,
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
