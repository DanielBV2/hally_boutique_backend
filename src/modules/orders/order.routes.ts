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
import { prisma } from "../../config/prisma.js";

const orderRepository = new PrismaOrderRepository(prisma);
const cartRepository = new PrismaCartRepository(prisma);
const addressRepository = new PrismaAddressRepository(prisma);
const orderService = new OrderServiceImpl(
  orderRepository,
  cartRepository,
  addressRepository,
);
const orderController = new OrderController(orderService);

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

export { router as orderRoutes };
