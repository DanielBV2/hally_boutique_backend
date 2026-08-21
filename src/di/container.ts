import { prisma } from "../config/prisma.js";
import { PrismaAuthRepository } from "../modules/auth/auth.repository.js";
import { PrismaRefreshTokenRepository } from "../modules/auth/refresh-token.repository.js";
import { PrismaPasswordResetTokenRepository } from "../modules/auth/password-reset-token.repository.js";
import { AuthServiceImpl } from "../modules/auth/auth.service.js";
import { AuthController } from "../modules/auth/auth.controller.js";
import { PrismaProductRepository } from "../modules/products/product.repository.js";
import { ProductServiceImpl } from "../modules/products/product.service.js";
import { ProductController } from "../modules/products/product.controller.js";
import { PrismaVariantRepository } from "../modules/products/variant.repository.js";
import { VariantServiceImpl } from "../modules/products/variant.service.js";
import { VariantController } from "../modules/products/variant.controller.js";
import { PrismaCategoryRepository } from "../modules/categories/category.repository.js";
import { CategoryServiceImpl } from "../modules/categories/category.service.js";
import { CategoryController } from "../modules/categories/category.controller.js";
import { PrismaCartRepository } from "../modules/cart/cart.repository.js";
import { CartServiceImpl } from "../modules/cart/cart.service.js";
import { CartController } from "../modules/cart/cart.controller.js";
import { PrismaAddressRepository } from "../modules/addresses/address.repository.js";
import { AddressServiceImpl } from "../modules/addresses/address.service.js";
import { AddressController } from "../modules/addresses/address.controller.js";
import { PrismaOrderRepository } from "../modules/orders/order.repository.js";
import { OrderServiceImpl } from "../modules/orders/order.service.js";
import { OrderController } from "../modules/orders/order.controller.js";
import { PrismaPaymentRepository } from "../modules/payments/payment.repository.js";
import {
  PaymentServiceImpl,
  type TransactionRunner,
} from "../modules/payments/payment.service.js";
import { PaymentController } from "../modules/payments/payment.controller.js";
import { PrismaMetricsRepository } from "../modules/metrics/metrics.repository.js";
import { MetricsServiceImpl } from "../modules/metrics/metrics.service.js";
import { MetricsController } from "../modules/metrics/metrics.controller.js";
import { PrismaJobQueue } from "../shared/utils/jobQueue.js";
import { JobWorker } from "../shared/utils/jobWorker.js";
import { createGenerateShippingLabelHandler } from "../jobs/handlers/generateShippingLabel.handler.js";
import { env } from "../config/env.js";

const authRepository = new PrismaAuthRepository(prisma);
const refreshTokenRepository = new PrismaRefreshTokenRepository(prisma);
const passwordResetTokenRepository = new PrismaPasswordResetTokenRepository(prisma);
const productRepository = new PrismaProductRepository(prisma);
const variantRepository = new PrismaVariantRepository(prisma);
const categoryRepository = new PrismaCategoryRepository(prisma);
const cartRepository = new PrismaCartRepository(prisma);
const addressRepository = new PrismaAddressRepository(prisma);
const orderRepository = new PrismaOrderRepository(prisma);
const paymentRepository = new PrismaPaymentRepository(prisma);
const metricsRepository = new PrismaMetricsRepository(prisma);

const transactionRunner: TransactionRunner = {
  runTransaction: (fn) => prisma.$transaction(fn),
};

const jobQueue = new PrismaJobQueue(prisma);
const jobWorker = new JobWorker(prisma, {
  pollIntervalMs: env.JOB_POLL_INTERVAL_MS,
  batchSize: env.JOB_BATCH_SIZE,
});
jobWorker.register(
  "GENERATE_SHIPPING_LABEL",
  createGenerateShippingLabelHandler({ orderRepository }),
);

const authService = new AuthServiceImpl(
  authRepository,
  refreshTokenRepository,
  passwordResetTokenRepository,
);
const productService = new ProductServiceImpl(productRepository);
const variantService = new VariantServiceImpl(variantRepository, productRepository);
const categoryService = new CategoryServiceImpl(categoryRepository);
const cartService = new CartServiceImpl(cartRepository);
const addressService = new AddressServiceImpl(addressRepository);
const orderService = new OrderServiceImpl(orderRepository, cartRepository, addressRepository);
const paymentService = new PaymentServiceImpl(
  paymentRepository,
  orderRepository,
  variantRepository,
  transactionRunner,
  cartRepository,
  jobQueue,
);
const metricsService = new MetricsServiceImpl(metricsRepository);

export const container = {
  authController: new AuthController(authService),
  productController: new ProductController(productService),
  variantController: new VariantController(variantService),
  categoryController: new CategoryController(categoryService),
  cartController: new CartController(cartService),
  addressController: new AddressController(addressService),
  orderController: new OrderController(orderService),
  paymentController: new PaymentController(paymentService),
  metricsController: new MetricsController(metricsService),
  jobWorker,
};
