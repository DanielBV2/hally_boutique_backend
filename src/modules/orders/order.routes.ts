import { Router } from "express";
import { validateSchemaMiddleware } from "../../middlewares/validateSchemaMiddleware.js";
import { authMiddleware } from "../../middlewares/authMiddleware.js";
import {
  createOrderSchema,
  listOrdersQuerySchema,
  orderIdParamsSchema,
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
  "/",
  validateSchemaMiddleware(listOrdersQuerySchema, "query"),
  orderController.list,
);

router.get(
  "/:id",
  validateSchemaMiddleware(orderIdParamsSchema, "params"),
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

export { router as orderRoutes };
