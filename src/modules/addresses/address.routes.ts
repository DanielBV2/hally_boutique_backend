import { Router } from "express";
import { validateSchemaMiddleware } from "../../middlewares/validateSchemaMiddleware.js";
import { authMiddleware } from "../../middlewares/authMiddleware.js";
import {
  createAddressSchema,
  updateAddressSchema,
  addressIdParamsSchema,
} from "./address.schema.js";
import { container } from "../../di/container.js";

const { addressController } = container;

const router = Router();

router.use(authMiddleware);

router.get("/", addressController.list);

router.post(
  "/",
  validateSchemaMiddleware(createAddressSchema, "body"),
  addressController.create,
);

router.patch(
  "/:id",
  validateSchemaMiddleware(addressIdParamsSchema, "params"),
  validateSchemaMiddleware(updateAddressSchema, "body"),
  addressController.update,
);

router.delete(
  "/:id",
  validateSchemaMiddleware(addressIdParamsSchema, "params"),
  addressController.remove,
);

export { router as addressRoutes };
