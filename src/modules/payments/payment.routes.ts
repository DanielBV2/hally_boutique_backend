import { Router } from "express";
import { PaymentController } from "./payment.controller.js";
import { PrismaPaymentRepository } from "./payment.repository.js";
import { PaymentServiceImpl } from "./payment.service.js";
import { PrismaOrderRepository } from "../orders/order.repository.js";
import { PrismaVariantRepository } from "../products/variant.repository.js";
import { PrismaCartRepository } from "../cart/cart.repository.js";
import { prisma } from "../../config/prisma.js";

const paymentRepository = new PrismaPaymentRepository(prisma);
const orderRepository = new PrismaOrderRepository(prisma);
const variantRepository = new PrismaVariantRepository(prisma);
const cartRepository = new PrismaCartRepository(prisma);

const paymentService = new PaymentServiceImpl(
  paymentRepository,
  orderRepository,
  variantRepository,
  { runTransaction: (fn) => prisma.$transaction(fn) },
  cartRepository,
);
const paymentController = new PaymentController(paymentService);

const router = Router();

router.post("/webhook", paymentController.webhook);

// TODO: ruta temporal solo para pruebas de desarrollo, reemplazar por la URL real del frontend cuando exista.
router.get("/redirect", (req, res) => {
  res.json({
    success: true,
    data: {
      message: "Redirect de prueba recibido, esto es temporal",
      receivedParams: req.query,
    },
  });
});

export { router as paymentRoutes };
