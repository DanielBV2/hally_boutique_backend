import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../../src/config/env.js", () => ({
  env: {
    WOMPI_PUBLIC_KEY: "pub_test_key",
    WOMPI_PRIVATE_KEY: "prv_test_key",
    WOMPI_INTEGRITY_SECRET: "test_integrity_secret",
    WOMPI_EVENTS_SECRET: "test_events_secret",
    WOMPI_REDIRECT_URL: "https://example.com/redirect",
    SHIPPING_ORIGIN_NAME: "Hally Boutique",
    SHIPPING_ORIGIN_PHONE: "3001234567",
    SHIPPING_ORIGIN_STREET: "Calle 123",
    SHIPPING_ORIGIN_CITY: "Barranquilla",
    SHIPPING_ORIGIN_STATE: "Atlantico",
    SHIPPING_ORIGIN_COUNTRY: "CO",
    SHIPPING_ORIGIN_POSTALCODE: "080001",
  },
}));

vi.mock("../../../src/shared/utils/wompiSignature.js", () => ({
  generateIntegritySignature: vi.fn(),
  verifyEventChecksum: vi.fn(),
}));

vi.mock("../../../src/shared/utils/wompiClient.js", () => ({
  voidWompiTransaction: vi.fn(),
}));

vi.mock("../../../src/shared/utils/shippingClient.js", () => ({
  generateShippingLabel: vi.fn(),
  getShippingRate: vi.fn(),
  getAllShippingRates: vi.fn(),
  extractStreetNumber: vi.fn(),
}));

import { PaymentServiceImpl } from "../../../src/modules/payments/payment.service.js";
import type { PaymentRepository } from "../../../src/modules/payments/payment.repository.js";
import type { OrderRepository } from "../../../src/modules/orders/order.repository.js";
import type { VariantStockRepository, TransactionRunner } from "../../../src/modules/payments/payment.service.js";
import type { CartRepository } from "../../../src/modules/cart/cart.repository.js";
import type { OrderWithItems } from "../../../src/modules/orders/order.types.js";
import { NotFoundError, ConflictError, UnauthorizedError } from "../../../src/shared/errors/app-error.js";
import { generateIntegritySignature, verifyEventChecksum } from "../../../src/shared/utils/wompiSignature.js";
import { voidWompiTransaction } from "../../../src/shared/utils/wompiClient.js";
import { generateShippingLabel } from "../../../src/shared/utils/shippingClient.js";

function mockPaymentRepo(): PaymentRepository {
  return {
    findByOrderId: vi.fn(),
    findByProviderReferenceId: vi.fn(),
    create: vi.fn(),
    updateStatus: vi.fn(),
    updateProviderTransactionId: vi.fn(),
  };
}

function mockOrderRepo(): OrderRepository {
  return {
    findByIdempotencyKey: vi.fn(),
    findManyByUser: vi.fn(),
    findByIdWithItems: vi.fn(),
    createWithItems: vi.fn(),
    updateStatus: vi.fn(),
    updateShippingLabel: vi.fn(),
    updateShippingAndTotal: vi.fn(),
  };
}

function mockVariantStockRepo(): VariantStockRepository {
  return {
    decrementStockIfAvailable: vi.fn(),
  };
}

function mockTransactionRunner(): TransactionRunner {
  return {
    runTransaction: vi.fn(async (fn) => fn({})),
  };
}

function mockCartRepo(): CartRepository {
  return {
    findOrCreateByUserId: vi.fn(),
    findVariantById: vi.fn(),
    findItemById: vi.fn(),
    upsertItem: vi.fn(),
    updateItemQuantity: vi.fn(),
    removeItem: vi.fn(),
    clearCart: vi.fn(),
  };
}

function makeOrder(overrides: Partial<OrderWithItems> = {}): OrderWithItems {
  return {
    id: "order-1",
    userId: "user-1",
    status: "PENDING",
    subtotal: 100000,
    taxAmount: 0,
    shippingAmount: 0,
    total: 100000,
    currency: "COP",
    shippingAddressId: "addr-1",
    shippingFullName: "Juan Pérez",
    shippingPhone: "3001234567",
    shippingLine1: "Calle 123",
    shippingLine2: null,
    shippingCity: "Medellín",
    shippingState: "Antioquia",
    shippingCountry: "CO",
    shippingPostalCode: "050001",
    shippingCarrier: null,
    shippingService: null,
    shippingTrackingNumber: null,
    shippingLabelUrl: null,
    idempotencyKey: "idem-key-1",
    createdAt: new Date("2026-01-01"),
    updatedAt: new Date("2026-01-01"),
    ...overrides,
    items: overrides.items ?? [],
  } as OrderWithItems;
}

function makeWebhookEvent(overrides: Record<string, unknown> = {}) {
  return {
    event: "transaction.updated",
    data: {
      transaction: {
        id: "txn-123",
        status: "APPROVED",
        amount_in_cents: 100000,
        reference: "idem-key-1",
      },
    },
    signature: {
      checksum: "valid-checksum",
      properties: ["transaction.id", "transaction.status", "transaction.amount_in_cents"],
    },
    timestamp: 1700000000,
    ...overrides,
  };
}

describe("PaymentServiceImpl", () => {
  let paymentRepo: ReturnType<typeof mockPaymentRepo>;
  let orderRepo: ReturnType<typeof mockOrderRepo>;
  let variantStockRepo: ReturnType<typeof mockVariantStockRepo>;
  let txRunner: ReturnType<typeof mockTransactionRunner>;
  let cartRepo: ReturnType<typeof mockCartRepo>;
  let service: PaymentServiceImpl;

  beforeEach(() => {
    vi.clearAllMocks();
    paymentRepo = mockPaymentRepo();
    orderRepo = mockOrderRepo();
    variantStockRepo = mockVariantStockRepo();
    txRunner = mockTransactionRunner();
    cartRepo = mockCartRepo();
    service = new PaymentServiceImpl(paymentRepo, orderRepo, variantStockRepo, txRunner, cartRepo);
  });

  describe("createCheckout", () => {
    const userId = "user-1";
    const orderId = "order-1";

    it("lanza NotFoundError si la orden pertenece a otro usuario", async () => {
      vi.mocked(orderRepo.findByIdWithItems).mockResolvedValue(makeOrder({ userId: "other-user" }));

      await expect(service.createCheckout(userId, orderId)).rejects.toThrow(NotFoundError);
    });

    it("lanza ConflictError si la orden no está en PENDING", async () => {
      vi.mocked(orderRepo.findByIdWithItems).mockResolvedValue(makeOrder({ status: "PAID" }));

      await expect(service.createCheckout(userId, orderId)).rejects.toThrow(ConflictError);
    });

    it("lanza ConflictError si shippingCarrier es null", async () => {
      vi.mocked(orderRepo.findByIdWithItems).mockResolvedValue(
        makeOrder({ shippingCarrier: null, shippingService: null }),
      );

      await expect(service.createCheckout(userId, orderId)).rejects.toThrow(ConflictError);
    });

    it("reutiliza payment existente sin llamar create()", async () => {
      const order = makeOrder({ shippingCarrier: "coordinadora", shippingService: "express" });
      vi.mocked(orderRepo.findByIdWithItems).mockResolvedValue(order);
      vi.mocked(paymentRepo.findByOrderId).mockResolvedValue({ id: "pay-1", orderId } as any);
      vi.mocked(generateIntegritySignature).mockReturnValue("sig-123");

      await service.createCheckout(userId, orderId);

      expect(paymentRepo.create).not.toHaveBeenCalled();
      expect(paymentRepo.findByOrderId).toHaveBeenCalledWith(orderId);
    });

    it("caso feliz: amountInCents y signature correctos", async () => {
      const order = makeOrder({ total: 150000, shippingCarrier: "coordinadora", shippingService: "express" });
      vi.mocked(orderRepo.findByIdWithItems).mockResolvedValue(order);
      vi.mocked(paymentRepo.findByOrderId).mockResolvedValue(null);
      vi.mocked(paymentRepo.create).mockResolvedValue({ id: "pay-1" } as any);
      vi.mocked(generateIntegritySignature).mockReturnValue("expected-sig");

      const result = await service.createCheckout(userId, orderId);

      expect(result.amountInCents).toBe(Math.round(150000 * 100));
      expect(result.reference).toBe("idem-key-1");
      expect(result.signature).toBe("expected-sig");
      expect(result.currency).toBe("COP");

      expect(generateIntegritySignature).toHaveBeenCalledWith(
        "idem-key-1",
        Math.round(150000 * 100),
        "COP",
        "test_integrity_secret",
      );
    });
  });

  describe("processWebhookEvent", () => {
    it("lanza UnauthorizedError si checksum es inválido", async () => {
      vi.mocked(verifyEventChecksum).mockReturnValue(false);

      await expect(service.processWebhookEvent(makeWebhookEvent())).rejects.toThrow(UnauthorizedError);

      expect(orderRepo.updateStatus).not.toHaveBeenCalled();
      expect(paymentRepo.updateStatus).not.toHaveBeenCalled();
    });

    it("no actualiza nada si la orden no está en PENDING (idempotencia)", async () => {
      vi.mocked(verifyEventChecksum).mockReturnValue(true);
      vi.mocked(paymentRepo.findByProviderReferenceId).mockResolvedValue({
        id: "pay-1",
        order: makeOrder({ status: "PAID", items: [] }),
      } as any);

      await service.processWebhookEvent(makeWebhookEvent());

      expect(orderRepo.updateStatus).not.toHaveBeenCalled();
      expect(paymentRepo.updateStatus).not.toHaveBeenCalled();
    });

    it("APPROVED + stock disponible → Order PAID, Payment SUCCEEDED, clearCart, guía generada", async () => {
      vi.mocked(verifyEventChecksum).mockReturnValue(true);
      vi.mocked(paymentRepo.findByProviderReferenceId).mockResolvedValue({
        id: "pay-1",
        order: makeOrder({
          userId: "user-1",
          shippingCarrier: "coordinadora",
          shippingService: "express",
          items: [{ variantId: "v1", quantity: 2, weightGrams: 300 } as any],
        }),
      } as any);
      vi.mocked(variantStockRepo.decrementStockIfAvailable).mockResolvedValue(true);
      vi.mocked(cartRepo.findOrCreateByUserId).mockResolvedValue({ id: "cart-1" } as any);
      vi.mocked(generateShippingLabel).mockResolvedValue({
        success: true,
        trackingNumber: "track-123",
        labelUrl: "https://envia.com/label/123",
        trackUrl: "https://envia.com/track/123",
      });

      await service.processWebhookEvent(makeWebhookEvent());

      expect(orderRepo.updateStatus).toHaveBeenCalledWith("order-1", "PAID", expect.anything());
      expect(paymentRepo.updateStatus).toHaveBeenCalledWith("pay-1", "SUCCEEDED");
      expect(cartRepo.clearCart).toHaveBeenCalledWith("cart-1");
      expect(generateShippingLabel).toHaveBeenCalledWith(
        expect.objectContaining({
          name: "Hally Boutique",
          state: "ATL",
        }),
        expect.objectContaining({
          name: "Juan Pérez",
          street: "Calle 123",
          state: "ANT",
        }),
        expect.arrayContaining([
          expect.objectContaining({
            weight: 0.6,
            weightUnit: "KG",
            content: "Ropa",
            declaredValue: 100000,
          }),
        ]),
        "coordinadora",
        "express",
      );
      expect(orderRepo.updateShippingLabel).toHaveBeenCalledWith("order-1", {
        shippingTrackingNumber: "track-123",
        shippingLabelUrl: "https://envia.com/label/123",
      });
    });

    it("APPROVED + guía fallida → Order sigue en PAID, console.error con GENERACIÓN DE GUÍA FALLIDA", async () => {
      vi.mocked(verifyEventChecksum).mockReturnValue(true);
      vi.mocked(paymentRepo.findByProviderReferenceId).mockResolvedValue({
        id: "pay-1",
        order: makeOrder({
          userId: "user-1",
          shippingCarrier: "coordinadora",
          shippingService: "express",
          items: [{ variantId: "v1", quantity: 2, weightGrams: 300 } as any],
        }),
      } as any);
      vi.mocked(variantStockRepo.decrementStockIfAvailable).mockResolvedValue(true);
      vi.mocked(cartRepo.findOrCreateByUserId).mockResolvedValue({ id: "cart-1" } as any);
      vi.mocked(generateShippingLabel).mockResolvedValue({
        success: false,
        error: "envia.com timeout",
      });

      const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      await service.processWebhookEvent(makeWebhookEvent());

      expect(orderRepo.updateStatus).toHaveBeenCalledWith("order-1", "PAID", expect.anything());
      expect(orderRepo.updateStatus).not.toHaveBeenCalledWith("order-1", "CANCELLED");
      expect(paymentRepo.updateStatus).toHaveBeenCalledWith("pay-1", "SUCCEEDED");
      expect(orderRepo.updateShippingLabel).not.toHaveBeenCalled();
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining("GENERACIÓN DE GUÍA FALLIDA"),
      );
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining("Order order-1"),
      );

      consoleSpy.mockRestore();
    });

    it("APPROVED + sin stock + void exitoso → Payment REFUNDED, Order CANCELLED", async () => {
      vi.mocked(verifyEventChecksum).mockReturnValue(true);
      vi.mocked(paymentRepo.findByProviderReferenceId).mockResolvedValue({
        id: "pay-1",
        order: makeOrder({
          userId: "user-1",
          items: [{ variantId: "v1", quantity: 2 }],
        }),
      } as any);
      vi.mocked(variantStockRepo.decrementStockIfAvailable).mockResolvedValue(false);
      vi.mocked(voidWompiTransaction).mockResolvedValue({ success: true });

      await service.processWebhookEvent(makeWebhookEvent());

      expect(orderRepo.updateStatus).toHaveBeenCalledWith("order-1", "CANCELLED");
      expect(paymentRepo.updateStatus).toHaveBeenCalledWith("pay-1", "REFUNDED");
      expect(voidWompiTransaction).toHaveBeenCalledWith("txn-123", "prv_test_key");
    });

    it("APPROVED + sin stock + void fallido → Payment FAILED, Order CANCELLED, console.error", async () => {
      vi.mocked(verifyEventChecksum).mockReturnValue(true);
      vi.mocked(paymentRepo.findByProviderReferenceId).mockResolvedValue({
        id: "pay-1",
        order: makeOrder({
          userId: "user-1",
          items: [{ variantId: "v1", quantity: 2 }],
        }),
      } as any);
      vi.mocked(variantStockRepo.decrementStockIfAvailable).mockResolvedValue(false);
      vi.mocked(voidWompiTransaction).mockResolvedValue({ success: false, error: "void failed" });

      const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      await service.processWebhookEvent(makeWebhookEvent());

      expect(orderRepo.updateStatus).toHaveBeenCalledWith("order-1", "CANCELLED");
      expect(paymentRepo.updateStatus).toHaveBeenCalledWith("pay-1", "FAILED");
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining("REEMBOLSO MANUAL REQUERIDO"),
      );

      consoleSpy.mockRestore();
    });

    it("DECLINED → Order CANCELLED, Payment FAILED, sin void", async () => {
      vi.mocked(verifyEventChecksum).mockReturnValue(true);
      vi.mocked(paymentRepo.findByProviderReferenceId).mockResolvedValue({
        id: "pay-1",
        order: makeOrder({
          userId: "user-1",
          items: [{ variantId: "v1", quantity: 2 }],
        }),
      } as any);

      const event = makeWebhookEvent({
        data: {
          transaction: {
            id: "txn-123",
            status: "DECLINED",
            amount_in_cents: 100000,
            reference: "idem-key-1",
          },
        },
      });

      await service.processWebhookEvent(event);

      expect(orderRepo.updateStatus).toHaveBeenCalledWith("order-1", "CANCELLED");
      expect(paymentRepo.updateStatus).toHaveBeenCalledWith("pay-1", "FAILED");
      expect(voidWompiTransaction).not.toHaveBeenCalled();
    });

    it("PENDING → ningún método de actualización fue llamado", async () => {
      vi.mocked(verifyEventChecksum).mockReturnValue(true);
      vi.mocked(paymentRepo.findByProviderReferenceId).mockResolvedValue({
        id: "pay-1",
        order: makeOrder({
          userId: "user-1",
          items: [],
        }),
      } as any);

      const event = makeWebhookEvent({
        data: {
          transaction: {
            id: "txn-123",
            status: "PENDING",
            amount_in_cents: 100000,
            reference: "idem-key-1",
          },
        },
      });

      await service.processWebhookEvent(event);

      expect(orderRepo.updateStatus).not.toHaveBeenCalled();
      expect(paymentRepo.updateStatus).not.toHaveBeenCalled();
    });
  });
});
