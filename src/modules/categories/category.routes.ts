import { Router } from "express";
import { validateSchemaMiddleware } from "../../middlewares/validateSchemaMiddleware.js";
import { authMiddleware } from "../../middlewares/authMiddleware.js";
import { roleMiddleware } from "../../middlewares/roleMiddleware.js";
import {
  createCategorySchema,
  updateCategorySchema,
  categoryIdParamsSchema,
  categorySlugParamsSchema,
  adminCategoriesQuerySchema,
} from "./category.schema.js";
import { container } from "../../di/container.js";

const { categoryController } = container;

const router = Router();

router.get("/", categoryController.list);

router.get(
  "/admin/all",
  authMiddleware,
  roleMiddleware("ADMIN"),
  validateSchemaMiddleware(adminCategoriesQuerySchema, "query"),
  categoryController.listAdmin,
);

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
