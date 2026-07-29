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

        try {
          await this.transactionRunner.runTransaction(async (tx) => {
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

            await this.orderRepository.updateStatus(payment.order.id, "PAID", tx);
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

        await this.paymentRepository.updateStatus(payment.id, "SUCCEEDED");
        const cart = await this.cartRepository.findOrCreateByUserId(payment.order.userId);
        await this.cartRepository.clearCart(cart.id);
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
