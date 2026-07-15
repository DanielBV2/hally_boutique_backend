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
import { ProductController } from "./product.controller.js";
import { PrismaProductRepository } from "./product.repository.js";
import { ProductServiceImpl } from "./product.service.js";
import { prisma } from "../../config/prisma.js";

const repository = new PrismaProductRepository(prisma);
const service = new ProductServiceImpl(repository);
const controller = new ProductController(service);

const router = Router();

router.get(
  "/",
  validateSchemaMiddleware(listProductsQuerySchema, "query"),
  controller.list,
);

router.get(
  "/:slug",
  validateSchemaMiddleware(slugParamsSchema, "params"),
  controller.getBySlug,
);

router.post(
  "/",
  authMiddleware,
  roleMiddleware("ADMIN"),
  validateSchemaMiddleware(createProductSchema, "body"),
  controller.create,
);

router.patch(
  "/:id",
  authMiddleware,
  roleMiddleware("ADMIN"),
  validateSchemaMiddleware(idParamsSchema, "params"),
  validateSchemaMiddleware(updateProductSchema, "body"),
  controller.update,
);

router.delete(
  "/:id",
  authMiddleware,
  roleMiddleware("ADMIN"),
  validateSchemaMiddleware(idParamsSchema, "params"),
  controller.remove,
);

router.post(
  "/:id/images",
  authMiddleware,
  roleMiddleware("ADMIN"),
  validateSchemaMiddleware(idParamsSchema, "params"),
  validateSchemaMiddleware(addProductImageSchema, "body"),
  controller.addImage,
);

router.delete(
  "/:id/images/:imageId",
  authMiddleware,
  roleMiddleware("ADMIN"),
  validateSchemaMiddleware(imageParamsSchema, "params"),
  controller.removeImage,
);

export { router as productRoutes };
