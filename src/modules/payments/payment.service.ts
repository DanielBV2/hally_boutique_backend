import type { PrismaClient, Prisma } from "@prisma/client";
import type { CheckoutParamsDTO } from "./payment.dto.js";
import { wompiWebhookSchema, type WompiWebhookInput } from "./payment.schema.js";
import type { PaymentRepository } from "./payment.repository.js";
import type { OrderRepository } from "../orders/order.repository.js";
import type { CartRepository } from "../cart/cart.repository.js";
import { NotFoundError, ConflictError, UnauthorizedError } from "../../shared/errors/app-error.js";
import { env } from "../../config/env.js";
import { generateIntegritySignature, verifyEventChecksum } from "../../shared/utils/wompiSignature.js";
import { voidWompiTransaction } from "../../shared/utils/wompiClient.js";
import { toDepartmentCode } from "../../shared/utils/colombiaDepartmentCodes.js";
import { extractStreetNumber, generateShippingLabel } from "../../shared/utils/shippingClient.js";
import { jobQueue as sharedJobQueue, type JobQueue } from "../../shared/utils/jobQueue.js";
import { logger } from "../../shared/utils/logger.js";
import { buildPackagesFromOrder } from "../orders/order.service.js";

export interface VariantStockRepository {
  decrementStockIfAvailable(
    variantId: string,
    quantity: number,
    tx: Prisma.TransactionClient,
  ): Promise<boolean>;
}

export interface TransactionRunner {
  runTransaction<T>(fn: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T>;
}

export interface PaymentService {
  createCheckout(userId: string, orderId: string): Promise<CheckoutParamsDTO>;
  processWebhookEvent(rawEvent: unknown, reqId?: string): Promise<void>;
}

export class PaymentServiceImpl implements PaymentService {
  constructor(
    private readonly paymentRepository: PaymentRepository,
    private readonly orderRepository: OrderRepository,
    private readonly variantStockRepository: VariantStockRepository,
    private readonly transactionRunner: TransactionRunner,
    private readonly cartRepository: CartRepository,
    private readonly jobQueue: JobQueue = sharedJobQueue,
  ) {}

  async createCheckout(userId: string, orderId: string): Promise<CheckoutParamsDTO> {
    const order = await this.orderRepository.findByIdWithItems(orderId);
    if (!order || order.userId !== userId) {
      throw new NotFoundError("Order");
    }

    if (order.status !== "PENDING") {
      throw new ConflictError("La orden no está en estado PENDING");
    }

    if (!order.shippingCarrier || !order.shippingService) {
      throw new ConflictError("Debes seleccionar un método de envío antes de pagar");
    }

    const existingPayment = await this.paymentRepository.findByOrderId(orderId);

    const reference = order.idempotencyKey;
    const amountInCents = Math.round(Number(order.total) * 100);
    const signature = generateIntegritySignature(
      reference,
      amountInCents,
      order.currency,
      env.WOMPI_INTEGRITY_SECRET,
    );

    if (!existingPayment) {
      await this.paymentRepository.create({
        orderId,
        providerReferenceId: reference,
        amount: Number(order.total),
        currency: order.currency,
      });
    }

    return {
      publicKey: env.WOMPI_PUBLIC_KEY,
      currency: order.currency,
      amountInCents,
      reference,
      signature,
      redirectUrl: env.WOMPI_REDIRECT_URL,
    };
  }

  async processWebhookEvent(rawEvent: unknown, reqId?: string): Promise<void> {
    const parsed = wompiWebhookSchemaSafeParse(rawEvent, reqId);
    if (!parsed) return;

    const isValid = verifyEventChecksum(parsed, env.WOMPI_EVENTS_SECRET);
    if (!isValid) {
      throw new UnauthorizedError("Checksum de webhook inválido");
    }

    const { transaction } = parsed.data;
    const payment = await this.paymentRepository.findByProviderReferenceId(transaction.reference);

    if (!payment) {
      logger.warn(
        {
          reqId,
          transactionId: transaction.id,
          reference: transaction.reference,
        },
        "[Payments] Webhook received for unknown reference",
      );
      return;
    }

    const webhookLog = {
      reqId,
      transactionId: transaction.id,
      reference: transaction.reference,
      paymentId: payment.id,
      orderId: payment.order.id,
    };

    await this.paymentRepository.updateProviderTransactionId(payment.id, transaction.id);

    if (payment.order.status !== "PENDING") {
      logger.info({ ...webhookLog, orderStatus: payment.order.status }, "[Payments] Webhook ignorado: orden ya procesada");
      return;
    }

    switch (transaction.status) {
      case "APPROVED": {
        let allStockAvailable = true;
        let claimed = false;

        try {
          await this.transactionRunner.runTransaction(async (tx) => {
            claimed = await this.orderRepository.tryTransitionToPaid(
              payment.order.id,
              tx,
            );
            if (!claimed) {
              return;
            }

            for (const item of payment.order.items) {
              const success = await this.variantStockRepository.decrementStockIfAvailable(
                item.variantId,
                item.quantity,
                tx,
              );
              if (!success) {
                allStockAvailable = false;
                throw new Error("INSUFFICIENT_STOCK");
              }
            }

            await this.paymentRepository.updateStatus(payment.id, "SUCCEEDED", tx);
            const cart = await this.cartRepository.findOrCreateByUserId(
              payment.order.userId,
              tx,
            );
            await this.cartRepository.clearCart(cart.id, tx);
          });
        } catch {
          if (!allStockAvailable) {
            await this.orderRepository.updateStatus(payment.order.id, "CANCELLED");

            const voidResult = await voidWompiTransaction(
              transaction.id,
              env.WOMPI_PRIVATE_KEY,
            );

            if (voidResult.success) {
              await this.paymentRepository.updateStatus(payment.id, "REFUNDED");
              logger.info(
                { ...webhookLog },
                "[Payments] Stock insuficiente: transacción anulada (REFUNDED)",
              );
            } else {
              await this.paymentRepository.updateStatus(payment.id, "FAILED");
              logger.error(
                {
                  ...webhookLog,
                  reason: voidResult.error,
                },
                "REEMBOLSO MANUAL REQUERIDO — Payment, Order. Generar manualmente desde el dashboard de Wompi.",
              );
            }
          }
          return;
        }

        if (!claimed) {
          return;
        }

        logger.info(
          { ...webhookLog, stockClaimed: true },
          "[Payments] Pago APPROVED: Order PAID, stock descontado, carrito vaciado",
        );

        const order = payment.order;
        if (order.shippingCarrier && order.shippingService) {
          const carrier = order.shippingCarrier;
          const service = order.shippingService;

          this.jobQueue.schedule(`shipping-label:${order.id}`, async () => {
            const origin = {
              name: env.SHIPPING_ORIGIN_NAME,
              phone: env.SHIPPING_ORIGIN_PHONE,
              street: env.SHIPPING_ORIGIN_STREET,
              number: env.SHIPPING_ORIGIN_NUMBER,
              city: env.SHIPPING_ORIGIN_CITY,
              state: toDepartmentCode(env.SHIPPING_ORIGIN_STATE),
              country: env.SHIPPING_ORIGIN_COUNTRY,
              postalCode: env.SHIPPING_ORIGIN_POSTALCODE,
            };

            const destination = {
              name: order.shippingFullName,
              phone: order.shippingPhone,
              street: order.shippingLine1,
              number: extractStreetNumber(order.shippingLine1),
              city: order.shippingCity,
              state: toDepartmentCode(order.shippingState),
              country: order.shippingCountry,
              postalCode: order.shippingPostalCode ?? "",
            };

            const packages = buildPackagesFromOrder(order);

            const labelResult = await generateShippingLabel(
              origin,
              destination,
              packages,
              carrier,
              service,
            );

            if (labelResult.success) {
              await this.orderRepository.updateShippingLabel(order.id, {
                shippingTrackingNumber: labelResult.trackingNumber ?? "",
                shippingLabelUrl: labelResult.labelUrl ?? "",
              });
            } else {
              await this.orderRepository.markShippingLabelFailed(order.id);
              logger.error(
                {
                  ...webhookLog,
                  reason: labelResult.error,
                },
                "GENERACIÓN DE GUÍA FALLIDA — Order. Generar manualmente desde el dashboard de Envia.com.",
              );
            }
          });
        }
        break;
      }

      case "DECLINED":
      case "VOIDED":
      case "ERROR": {
        await this.orderRepository.updateStatus(payment.order.id, "CANCELLED");
        await this.paymentRepository.updateStatus(payment.id, "FAILED");
        logger.info(
          { ...webhookLog, paymentStatus: transaction.status },
          "[Payments] Pago rechazado: Order CANCELLED, Payment FAILED",
        );
        break;
      }

      case "PENDING":
        logger.info(
          { ...webhookLog },
          "[Payments] Pago PENDING: se espera el próximo webhook",
        );
        break;
    }
  }
}

function wompiWebhookSchemaSafeParse(
  raw: unknown,
  reqId?: string,
): WompiWebhookInput | null {
  const result = wompiWebhookSchema.safeParse(raw);
  if (!result.success) {
    logger.warn(
      { reqId, errors: result.error.flatten() },
      "[Payments] Webhook validation failed",
    );
    return null;
  }
  return result.data;
}
