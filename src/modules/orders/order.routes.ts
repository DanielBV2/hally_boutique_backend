import { Router } from "express";
import { validateSchemaMiddleware } from "../../middlewares/validateSchemaMiddleware.js";
import { authMiddleware } from "../../middlewares/authMiddleware.js";
import { roleMiddleware } from "../../middlewares/roleMiddleware.js";
import {
  createOrderSchema,
  listOrdersQuerySchema,
  idParamsSchema,
  orderIdParamsSchema,
  shippingSelectionSchema,
  adminOrdersQuerySchema,
  updateOrderStatusSchema,
  updateOrderAddressSchema,
} from "./order.schema.js";
import { container } from "../../di/container.js";
import { createCheckoutParamsSchema } from "../payments/payment.schema.js";

const { orderController, paymentController } = container;

const router = Router();

router.use(authMiddleware);

router.get(
  "/admin/all",
  roleMiddleware("ADMIN"),
  validateSchemaMiddleware(adminOrdersQuerySchema, "query"),
  orderController.listAllAdmin,
);

router.get(
  "/admin/:id",
  roleMiddleware("ADMIN"),
  validateSchemaMiddleware(idParamsSchema, "params"),
  orderController.getByIdAdmin,
);

router.patch(
  "/admin/:id/status",
  roleMiddleware("ADMIN"),
  validateSchemaMiddleware(idParamsSchema, "params"),
  validateSchemaMiddleware(updateOrderStatusSchema, "body"),
  orderController.updateStatusAdmin,
);

router.get("/", validateSchemaMiddleware(listOrdersQuerySchema, "query"), orderController.list);

router.get("/:id", validateSchemaMiddleware(idParamsSchema, "params"), orderController.getById);

router.post("/", validateSchemaMiddleware(createOrderSchema, "body"), orderController.create);

router.post(
  "/:orderId/checkout",
  validateSchemaMiddleware(createCheckoutParamsSchema, "params"),
  paymentController.checkout,
);

router.post(
  "/:orderId/shipping-quote",
  validateSchemaMiddleware(orderIdParamsSchema, "params"),
  orderController.shippingQuote,
);

router.patch(
  "/:orderId/shipping-selection",
  validateSchemaMiddleware(orderIdParamsSchema, "params"),
  validateSchemaMiddleware(shippingSelectionSchema, "body"),
  orderController.selectShipping,
);

router.patch(
  "/:orderId/address",
  validateSchemaMiddleware(orderIdParamsSchema, "params"),
  validateSchemaMiddleware(updateOrderAddressSchema, "body"),
  orderController.updateAddress,
);

export { router as orderRoutes };
