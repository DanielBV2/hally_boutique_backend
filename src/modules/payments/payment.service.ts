import type { PrismaClient } from "@prisma/client";
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
import { jobQueue, type JobQueue } from "../../shared/utils/jobQueue.js";
import { buildPackagesFromOrder } from "../orders/order.service.js";

export interface VariantStockRepository {
  decrementStockIfAvailable(variantId: string, quantity: number, tx: unknown): Promise<boolean>;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export interface TransactionRunner {
  runTransaction<T>(fn: (tx: any) => Promise<T>): Promise<T>;
}

export interface PaymentService {
  createCheckout(userId: string, orderId: string): Promise<CheckoutParamsDTO>;
  processWebhookEvent(rawEvent: unknown): Promise<void>;
}

export class PaymentServiceImpl implements PaymentService {
  constructor(
    private readonly paymentRepository: PaymentRepository,
    private readonly orderRepository: OrderRepository,
    private readonly variantStockRepository: VariantStockRepository,
    private readonly transactionRunner: TransactionRunner,
    private readonly cartRepository: CartRepository,
    private readonly jobQueue: JobQueue = jobQueue,
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

  async processWebhookEvent(rawEvent: unknown): Promise<void> {
    const parsed = wompiWebhookSchemaSafeParse(rawEvent);
    if (!parsed) return;

    const isValid = verifyEventChecksum(parsed, env.WOMPI_EVENTS_SECRET);
    if (!isValid) {
      throw new UnauthorizedError("Checksum de webhook inválido");
    }

    const { transaction } = parsed.data;
    const payment = await this.paymentRepository.findByProviderReferenceId(transaction.reference);

    if (!payment) {
      console.warn(`[Payments] Webhook received for unknown reference: ${transaction.reference}`);
      return;
    }

    await this.paymentRepository.updateProviderTransactionId(payment.id, transaction.id);

    if (payment.order.status !== "PENDING") {
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
            } else {
              await this.paymentRepository.updateStatus(payment.id, "FAILED");
              console.error(
                `⚠️ REEMBOLSO MANUAL REQUERIDO — Payment ${payment.id}, Order ${payment.order.id}, razón: ${voidResult.error}`,
              );
            }
          }
          return;
        }

        if (!claimed) {
          return;
        }

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
              console.error(
                `⚠️ GENERACIÓN DE GUÍA FALLIDA — Order ${order.id}, razón: ${labelResult.error}. Generar manualmente desde el dashboard de Envia.com.`,
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
        break;
      }

      case "PENDING":
        break;
    }
  }
}

function wompiWebhookSchemaSafeParse(raw: unknown): WompiWebhookInput | null {
  const result = wompiWebhookSchema.safeParse(raw);
  if (!result.success) {
    console.warn("[Payments] Webhook validation failed:", result.error.flatten());
    return null;
  }
  return result.data;
}
