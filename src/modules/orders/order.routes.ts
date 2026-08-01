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
} from "./order.schema.js";
import { OrderController } from "./order.controller.js";
import { PrismaOrderRepository } from "./order.repository.js";
import { OrderServiceImpl } from "./order.service.js";
import { PrismaCartRepository } from "../cart/cart.repository.js";
import { PrismaAddressRepository } from "../addresses/address.repository.js";
import { PrismaVariantRepository } from "../products/variant.repository.js";
import { PrismaPaymentRepository } from "../payments/payment.repository.js";
import { PaymentServiceImpl } from "../payments/payment.service.js";
import { PaymentController } from "../payments/payment.controller.js";
import { prisma } from "../../config/prisma.js";
import { createCheckoutParamsSchema } from "../payments/payment.schema.js";

const orderRepository = new PrismaOrderRepository(prisma);
const cartRepository = new PrismaCartRepository(prisma);
const addressRepository = new PrismaAddressRepository(prisma);
const variantRepository = new PrismaVariantRepository(prisma);
const paymentRepository = new PrismaPaymentRepository(prisma);
const orderService = new OrderServiceImpl(
  orderRepository,
  cartRepository,
  addressRepository,
);
const orderController = new OrderController(orderService);

const paymentService = new PaymentServiceImpl(
  paymentRepository,
  orderRepository,
  variantRepository,
  { runTransaction: (fn) => prisma.$transaction(fn) },
  cartRepository,
);
const paymentController = new PaymentController(paymentService);

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

router.get(
  "/",
  validateSchemaMiddleware(listOrdersQuerySchema, "query"),
  orderController.list,
);

router.get(
  "/:id",
  validateSchemaMiddleware(idParamsSchema, "params"),
  orderController.getById,
);

router.post(
  "/",
  validateSchemaMiddleware(createOrderSchema, "body"),
  orderController.create,
);

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

export { router as orderRoutes };
