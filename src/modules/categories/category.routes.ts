import { Router } from "express";
import { validateSchemaMiddleware } from "../../middlewares/validateSchemaMiddleware.js";
import { authMiddleware } from "../../middlewares/authMiddleware.js";
import { roleMiddleware } from "../../middlewares/roleMiddleware.js";
import {
  createCategorySchema,
  updateCategorySchema,
  categoryIdParamsSchema,
  categorySlugParamsSchema,
} from "./category.schema.js";
import { CategoryController } from "./category.controller.js";
import { PrismaCategoryRepository } from "./category.repository.js";
import { CategoryServiceImpl } from "./category.service.js";
import { prisma } from "../../config/prisma.js";

const categoryRepository = new PrismaCategoryRepository(prisma);
const categoryService = new CategoryServiceImpl(categoryRepository);
const categoryController = new CategoryController(categoryService);

const router = Router();

router.get("/", categoryController.list);

router.get(
  "/:slug",
  validateSchemaMiddleware(categorySlugParamsSchema, "params"),
  categoryController.getBySlug,
);

router.post(
  "/",
  authMiddleware,
  roleMiddleware("ADMIN"),
  validateSchemaMiddleware(createCategorySchema, "body"),
  categoryController.create,
);

router.patch(
  "/:id",
  authMiddleware,
  roleMiddleware("ADMIN"),
  validateSchemaMiddleware(categoryIdParamsSchema, "params"),
  validateSchemaMiddleware(updateCategorySchema, "body"),
  categoryController.update,
);

router.delete(
  "/:id",
  authMiddleware,
  roleMiddleware("ADMIN"),
  validateSchemaMiddleware(categoryIdParamsSchema, "params"),
  categoryController.remove,
);

export { router as categoryRoutes };
