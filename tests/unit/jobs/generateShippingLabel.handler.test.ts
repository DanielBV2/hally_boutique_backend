import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../../src/config/env.js", () => ({
  env: {
    SHIPPING_ORIGIN_NAME: "Hally Boutique",
    SHIPPING_ORIGIN_PHONE: "3001234567",
    SHIPPING_ORIGIN_STREET: "Calle 123",
    SHIPPING_ORIGIN_NUMBER: "45",
    SHIPPING_ORIGIN_CITY: "Barranquilla",
    SHIPPING_ORIGIN_STATE: "Atlantico",
    SHIPPING_ORIGIN_COUNTRY: "CO",
    SHIPPING_ORIGIN_POSTALCODE: "080001",
  },
}));

vi.mock("../../../src/shared/utils/shippingClient.js", () => ({
  generateShippingLabel: vi.fn(),
  getShippingRate: vi.fn(),
  getAllShippingRates: vi.fn(),
  extractStreetNumber: vi.fn().mockReturnValue("67"),
}));

import { createGenerateShippingLabelHandler } from "../../../src/jobs/handlers/generateShippingLabel.handler.js";
import type { OrderRepository } from "../../../src/modules/orders/order.repository.js";
import type { OrderWithItems } from "../../../src/modules/orders/order.types.js";
import { logger } from "../../../src/shared/utils/logger.js";
import { generateShippingLabel, extractStreetNumber } from "../../../src/shared/utils/shippingClient.js";

function mockOrderRepo(): OrderRepository {
  return {
    findByIdempotencyKey: vi.fn(),
    findManyByUser: vi.fn(),
    findAllAdmin: vi.fn(),
    findByIdWithItems: vi.fn(),
    findByIdAdmin: vi.fn(),
    createWithItems: vi.fn(),
    updateStatus: vi.fn(),
    tryTransitionToPaid: vi.fn(),
    updateShippingLabel: vi.fn(),
    markShippingLabelFailed: vi.fn(),
    updateShippingAndTotal: vi.fn(),
    updateAddressAndResetShipping: vi.fn(),
  };
}

function makeOrder(overrides: Partial<OrderWithItems> = {}): OrderWithItems {
  return {
    id: "order-1",
    userId: "user-1",
    status: "PAID",
    subtotal: 100000,
    taxAmount: 0,
    shippingAmount: 0,
    total: 100000,
    currency: "COP",
    shippingAddressId: "addr-1",
    shippingFullName: "Juan Pérez",
    shippingPhone: "3001234567",
    shippingLine1: "Calle 45 #67-89",
    shippingLine2: null,
    shippingCity: "Medellín",
    shippingState: "Antioquia",
    shippingCountry: "CO",
    shippingPostalCode: "050001",
    shippingCarrier: "coordinadora",
    shippingService: "express",
    shippingTrackingNumber: null,
    shippingLabelUrl: null,
    idempotencyKey: "idem-key-1",
    createdAt: new Date("2026-01-01"),
    updatedAt: new Date("2026-01-01"),
    ...overrides,
    items: overrides.items ?? [{ variantId: "v1", quantity: 2, weightGrams: 300 } as never],
  } as OrderWithItems;
}

describe("generateShippingLabelHandler", () => {
  let orderRepo: ReturnType<typeof mockOrderRepo>;
  let handler: (payload: unknown) => Promise<void>;

  beforeEach(() => {
    vi.clearAllMocks();
    orderRepo = mockOrderRepo();
    handler = createGenerateShippingLabelHandler({ orderRepository: orderRepo });
  });

  it("caso feliz → generateShippingLabel con origin/destination/packages correctos y updateShippingLabel", async () => {
    vi.mocked(orderRepo.findByIdWithItems).mockResolvedValue(makeOrder());
    vi.mocked(generateShippingLabel).mockResolvedValue({
      success: true,
      trackingNumber: "track-123",
      labelUrl: "https://envia.com/label/123",
      trackUrl: "https://envia.com/track/123",
    });

    await handler({ orderId: "order-1" });

    expect(generateShippingLabel).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "Hally Boutique",
        phone: "3001234567",
        street: "Calle 123",
        number: "45",
        city: "Barranquilla",
        state: "ATL",
      }),
      expect.objectContaining({
        name: "Juan Pérez",
        street: "Calle 45 #67-89",
        number: "67",
        city: "Medellín",
        state: "ANT",
        country: "CO",
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
    expect(orderRepo.markShippingLabelFailed).not.toHaveBeenCalled();
  });

  it("Envia responde fallo → markShippingLabelFailed, logger.error y RELANZA el error para que el worker reintente", async () => {
    vi.mocked(orderRepo.findByIdWithItems).mockResolvedValue(makeOrder());
    vi.mocked(generateShippingLabel).mockResolvedValue({
      success: false,
      error: "envia.com timeout",
    });
    const errorSpy = vi.spyOn(logger, "error").mockImplementation(() => {});

    await expect(handler({ orderId: "order-1" })).rejects.toThrow(/Generación de guía fallida/);

    expect(orderRepo.markShippingLabelFailed).toHaveBeenCalledWith("order-1");
    expect(orderRepo.updateShippingLabel).not.toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalledWith(
      expect.objectContaining({ orderId: "order-1", reason: "envia.com timeout" }),
      expect.stringContaining("GENERACIÓN DE GUÍA FALLIDA"),
    );

    errorSpy.mockRestore();
  });

  it("orden no encontrada → lanza error (el worker lo registra como fallo del job)", async () => {
    vi.mocked(orderRepo.findByIdWithItems).mockResolvedValue(null);

    await expect(handler({ orderId: "order-missing" })).rejects.toThrow(
      /Order order-missing no encontrada/,
    );

    expect(generateShippingLabel).not.toHaveBeenCalled();
    expect(orderRepo.updateShippingLabel).not.toHaveBeenCalled();
  });

  it("extrae el número de la dirección de destino con extractStreetNumber", async () => {
    vi.mocked(orderRepo.findByIdWithItems).mockResolvedValue(makeOrder());
    vi.mocked(generateShippingLabel).mockResolvedValue({ success: true });

    await handler({ orderId: "order-1" });

    expect(extractStreetNumber).toHaveBeenCalledWith("Calle 45 #67-89");
  });
});
