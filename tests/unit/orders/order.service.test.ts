import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../../src/config/env.js", () => ({
  env: {
    TAX_RATE: 0.19,
    FREE_SHIPPING_THRESHOLD: 150000,
    SHIPPING_ORIGIN_NAME: "Hally Boutique",
    SHIPPING_ORIGIN_PHONE: "3001234567",
    SHIPPING_ORIGIN_STREET: "Calle 123",
    SHIPPING_ORIGIN_CITY: "Barranquilla",
    SHIPPING_ORIGIN_STATE: "Atlantico",
    SHIPPING_ORIGIN_COUNTRY: "CO",
    SHIPPING_ORIGIN_POSTALCODE: "080001",
  },
}));

vi.mock("../../../src/shared/utils/shippingClient.js", () => ({
  getAllShippingRates: vi.fn(),
  getShippingRate: vi.fn(),
}));

vi.mock("../../../src/shared/utils/staticShippingRates.js", () => ({
  getStaticShippingEstimate: vi.fn(),
}));

import { OrderServiceImpl } from "../../../src/modules/orders/order.service.js";
import type { OrderRepository } from "../../../src/modules/orders/order.repository.js";
import type { CartRepository } from "../../../src/modules/cart/cart.repository.js";
import type { AddressRepository } from "../../../src/modules/addresses/address.repository.js";
import type { OrderWithItems, AdminOrderWithUser } from "../../../src/modules/orders/order.types.js";
import { ValidationError, NotFoundError, ConflictError } from "../../../src/shared/errors/app-error.js";
import { getAllShippingRates } from "../../../src/shared/utils/shippingClient.js";
import { getStaticShippingEstimate } from "../../../src/shared/utils/staticShippingRates.js";

function mockOrderRepo(): OrderRepository {
  return {
    findByIdempotencyKey: vi.fn(),
    findManyByUser: vi.fn(),
    findAllAdmin: vi.fn(),
    findByIdWithItems: vi.fn(),
    findByIdAdmin: vi.fn(),
    createWithItems: vi.fn(),
    updateStatus: vi.fn(),
    updateShippingLabel: vi.fn(),
    markShippingLabelFailed: vi.fn(),
    updateShippingAndTotal: vi.fn(),
    updateAddressAndResetShipping: vi.fn(),
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

function mockAddressRepo(): AddressRepository {
  return {
    findAllByUser: vi.fn(),
    findById: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    unsetDefaultForUser: vi.fn(),
    delete: vi.fn(),
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
    shippingFullName: "Juan Perez",
    shippingPhone: "3001234567",
    shippingLine1: "Calle 123",
    shippingLine2: null,
    shippingCity: "Medellin",
    shippingState: "Antioquia",
    shippingCountry: "CO",
    shippingPostalCode: "050001",
    shippingCarrier: null,
    shippingService: null,
    idempotencyKey: "idem-key-1",
    createdAt: new Date("2026-01-01"),
    updatedAt: new Date("2026-01-01"),
    ...overrides,
    items: overrides.items ?? [],
  } as OrderWithItems;
}

function makeAdminOrder(overrides: Partial<AdminOrderWithUser> = {}): AdminOrderWithUser {
  return {
    ...makeOrder(),
    user: {
      email: "customer@example.com",
      firstName: "Ana",
      lastName: "Gomez",
    },
    ...overrides,
  };
}

function makeCartItem(overrides: Record<string, unknown> = {}) {
  return {
    id: "cart-item-1",
    cartId: "cart-1",
    variantId: "variant-1",
    quantity: 1,
    variant: {
      id: "variant-1",
      size: "M" as const,
      color: "Rojo",
      stock: 10,
      priceDelta: 0,
      product: {
        name: "Camiseta Basica",
        basePrice: 50000,
        weightGrams: 300,
        images: [],
      },
    },
    ...overrides,
  };
}

describe("OrderServiceImpl", () => {
  let orderRepo: ReturnType<typeof mockOrderRepo>;
  let cartRepo: ReturnType<typeof mockCartRepo>;
  let addressRepo: ReturnType<typeof mockAddressRepo>;
  let service: OrderServiceImpl;

  beforeEach(() => {
    vi.clearAllMocks();
    orderRepo = mockOrderRepo();
    cartRepo = mockCartRepo();
    addressRepo = mockAddressRepo();
    service = new OrderServiceImpl(orderRepo, cartRepo, addressRepo);
  });

  describe("createOrderFromCart", () => {
    const userId = "user-1";
    const input = { addressId: "addr-1", idempotencyKey: "idem-key-1" };

    it("lanza ValidationError si el carrito esta vacio", async () => {
      vi.mocked(orderRepo.findByIdempotencyKey).mockResolvedValue(null);
      vi.mocked(addressRepo.findById).mockResolvedValue({ id: "addr-1", userId } as any);
      vi.mocked(cartRepo.findOrCreateByUserId).mockResolvedValue({
        id: "cart-1",
        userId,
        items: [],
      } as any);

      await expect(service.createOrderFromCart(userId, input)).rejects.toThrow(ValidationError);
    });

    it("lanza NotFoundError si addressId no pertenece al usuario", async () => {
      vi.mocked(orderRepo.findByIdempotencyKey).mockResolvedValue(null);
      vi.mocked(addressRepo.findById).mockResolvedValue({ id: "addr-1", userId: "other-user" } as any);

      await expect(service.createOrderFromCart(userId, input)).rejects.toThrow(NotFoundError);
    });

    it("lanza ConflictError si quantity excede stock", async () => {
      vi.mocked(orderRepo.findByIdempotencyKey).mockResolvedValue(null);
      vi.mocked(addressRepo.findById).mockResolvedValue({ id: "addr-1", userId } as any);
      vi.mocked(cartRepo.findOrCreateByUserId).mockResolvedValue({
        id: "cart-1",
        userId,
        items: [makeCartItem({ quantity: 100 })],
      } as any);

      await expect(service.createOrderFromCart(userId, input)).rejects.toThrow(ConflictError);
    });

    it("devuelve la orden existente si idempotencyKey ya existe", async () => {
      const existing = makeOrder({ items: [] });
      vi.mocked(orderRepo.findByIdempotencyKey).mockResolvedValue(existing);

      const result = await service.createOrderFromCart(userId, input);

      expect(result.id).toBe("order-1");
      expect(orderRepo.createWithItems).not.toHaveBeenCalled();
    });

    it("caso feliz: crea orden con snapshot correcto y totales validos", async () => {
      vi.mocked(orderRepo.findByIdempotencyKey).mockResolvedValue(null);

      const mockAddress = {
        id: "addr-1",
        userId,
        fullName: "Juan Perez",
        phone: "3001234567",
        line1: "Calle 123",
        line2: null,
        city: "Medellin",
        state: "Antioquia",
        country: "CO",
        postalCode: "050001",
      };
      vi.mocked(addressRepo.findById).mockResolvedValue(mockAddress as any);

      const item1 = makeCartItem({
        variantId: "v1",
        quantity: 2,
        variant: {
          id: "v1", size: "M", color: "Rojo", stock: 10, priceDelta: 0,
          product: { name: "Camiseta", basePrice: 50000, weightGrams: 300, images: [] },
        },
      });
      const item2 = makeCartItem({
        id: "cart-item-2",
        variantId: "v2",
        quantity: 1,
        variant: {
          id: "v2", size: "L", color: "Azul", stock: 5, priceDelta: 5000,
          product: { name: "Pantalon", basePrice: 80000, weightGrams: 600, images: [] },
        },
      });

      vi.mocked(cartRepo.findOrCreateByUserId).mockResolvedValue({
        id: "cart-1", userId, items: [item1, item2],
      } as any);

      const expectedSubtotal = 180000;
      const expectedTax = Math.round(expectedSubtotal * 0.19);

      const created = makeOrder({
        subtotal: expectedSubtotal,
        taxAmount: expectedTax,
        total: expectedSubtotal + expectedTax,
        items: [
          { id: "oi-1", variantId: "v1", productName: "Camiseta", size: "M", color: "Rojo", unitPrice: 50000, quantity: 2, weightGrams: 300, orderId: "order-1" },
          { id: "oi-2", variantId: "v2", productName: "Pantalon", size: "L", color: "Azul", unitPrice: 85000, quantity: 1, weightGrams: 600, orderId: "order-1" },
        ] as any,
      });
      vi.mocked(orderRepo.createWithItems).mockResolvedValue(created);

      const result = await service.createOrderFromCart(userId, input);

      expect(result.subtotal).toBe(expectedSubtotal);
      expect(result.taxAmount).toBe(expectedTax);
      expect(result.total).toBe(expectedSubtotal + expectedTax);
      expect(result.items).toHaveLength(2);

      expect(result.items[0]).toMatchObject({
        productName: "Camiseta",
        size: "M",
        color: "Rojo",
        unitPrice: 50000,
        quantity: 2,
        lineTotal: 100000,
      });
      expect(result.items[1]).toMatchObject({
        productName: "Pantalon",
        size: "L",
        color: "Azul",
        unitPrice: 85000,
        quantity: 1,
        lineTotal: 85000,
      });

      expect(result.shippingFullName).toBe("Juan Perez");
      expect(result.shippingPhone).toBe("3001234567");
      expect(result.shippingLine1).toBe("Calle 123");
      expect(result.shippingLine2).toBeNull();
      expect(result.shippingCity).toBe("Medellin");
      expect(result.shippingState).toBe("Antioquia");
      expect(result.shippingCountry).toBe("CO");
      expect(result.shippingPostalCode).toBe("050001");

      expect(orderRepo.createWithItems).toHaveBeenCalledOnce();
      const createCall = vi.mocked(orderRepo.createWithItems).mock.calls[0]![0];
      expect(createCall.shippingFullName).toBe("Juan Perez");
      expect(createCall.shippingPhone).toBe("3001234567");
      expect(createCall.shippingLine1).toBe("Calle 123");
      expect(createCall.shippingCity).toBe("Medellin");
      expect(createCall.shippingState).toBe("Antioquia");
      expect(createCall.shippingCountry).toBe("CO");
    });
  });

  describe("getMyOrderById", () => {
    it("lanza NotFoundError si la orden pertenece a otro usuario", async () => {
      const order = makeOrder({ userId: "other-user" });
      vi.mocked(orderRepo.findByIdWithItems).mockResolvedValue(order);

      await expect(service.getMyOrderById("user-1", "order-1")).rejects.toThrow(NotFoundError);
    });

    it("devuelve el DTO mapeado si la orden pertenece al usuario", async () => {
      const order = makeOrder({
        items: [
          { id: "oi-1", variantId: "v1", productName: "Camiseta", size: "M", color: "Rojo", unitPrice: 50000, quantity: 2, orderId: "order-1" },
        ] as any,
      });
      vi.mocked(orderRepo.findByIdWithItems).mockResolvedValue(order);

      const result = await service.getMyOrderById("user-1", "order-1");

      expect(result.id).toBe("order-1");
      expect(result.status).toBe("PENDING");
      expect(result.items).toHaveLength(1);
      expect(result.items[0]).toMatchObject({
        productName: "Camiseta",
        size: "M",
        color: "Rojo",
        unitPrice: 50000,
        quantity: 2,
        lineTotal: 100000,
      });
    });
  });

  describe("getShippingQuote", () => {
    it("usa fallback estatico cuando todas las transportadoras fallan", async () => {
      const order = makeOrder({
        shippingState: "Antioquia",
        items: [
          { variantId: "v1", quantity: 2, weightGrams: 300 } as any,
        ],
      });
      vi.mocked(orderRepo.findByIdWithItems).mockResolvedValue(order);
      vi.mocked(getAllShippingRates).mockResolvedValue([]);
      vi.mocked(getStaticShippingEstimate).mockReturnValue({
        carrier: "estimado",
        service: "static",
        serviceDescription: "Estimado (tarifas en tiempo real no disponibles)",
        deliveryEstimate: "3-7 dias habiles",
        totalPrice: 18000,
        currency: "COP",
      });

      const result = await service.getShippingQuote("user-1", "order-1");

      expect(result).toHaveLength(1);
      expect(result[0]!.carrier).toBe("estimado");
      expect(getStaticShippingEstimate).toHaveBeenCalledWith("Antioquia", 600);
    });

    it("lanza NotFoundError si la orden no pertenece al usuario", async () => {
      vi.mocked(orderRepo.findByIdWithItems).mockResolvedValue(
        makeOrder({ userId: "other-user" }),
      );

      await expect(
        service.getShippingQuote("user-1", "order-1"),
      ).rejects.toThrow(NotFoundError);
    });

    it("lanza ConflictError si la orden no esta en PENDING", async () => {
      vi.mocked(orderRepo.findByIdWithItems).mockResolvedValue(
        makeOrder({ status: "PAID" }),
      );

      await expect(
        service.getShippingQuote("user-1", "order-1"),
      ).rejects.toThrow(ConflictError);
    });
  });

  describe("selectShipping", () => {
    it("lanza ConflictError si la opcion ya no esta disponible", async () => {
      const order = makeOrder({
        items: [
          { variantId: "v1", quantity: 2, weightGrams: 300 } as any,
        ],
      });
      vi.mocked(orderRepo.findByIdWithItems).mockResolvedValue(order);
      vi.mocked(getAllShippingRates).mockResolvedValue([]);

      await expect(
        service.selectShipping("user-1", "order-1", { carrier: "coordinadora", service: "express" }),
      ).rejects.toThrow(ConflictError);
    });

    it("selectShipping exitoso: Order actualizado con shippingAmount correcto y total recalculado", async () => {
      const order = makeOrder({
        subtotal: 100000,
        taxAmount: 19000,
        total: 119000,
        items: [
          { variantId: "v1", quantity: 2, weightGrams: 300 } as any,
        ],
      });
      vi.mocked(orderRepo.findByIdWithItems).mockResolvedValue(order);
      vi.mocked(getAllShippingRates).mockResolvedValue([
        {
          carrier: "coordinadora",
          service: "express",
          serviceDescription: "Express",
          deliveryEstimate: "1-3 dias",
          totalPrice: 12000,
          currency: "COP",
        },
      ]);

      const updatedOrder = makeOrder({
        subtotal: 100000,
        taxAmount: 19000,
        shippingAmount: 12000,
        total: 131000,
        shippingCarrier: "coordinadora",
        shippingService: "express",
        items: [
          { variantId: "v1", quantity: 2, weightGrams: 300 } as any,
        ],
      });
      vi.mocked(orderRepo.updateShippingAndTotal).mockResolvedValue(updatedOrder);

      const result = await service.selectShipping("user-1", "order-1", {
        carrier: "coordinadora",
        service: "express",
      });

      expect(result.shippingCarrier).toBe("coordinadora");
      expect(result.shippingService).toBe("express");
      expect(result.shippingAmount).toBe(12000);
      expect(result.total).toBe(131000);
      expect(orderRepo.updateShippingAndTotal).toHaveBeenCalledWith("order-1", {
        shippingCarrier: "coordinadora",
        shippingService: "express",
        shippingAmount: 12000,
        total: 131000,
      });
    });

    it("aplica envio gratis si subtotal >= FREE_SHIPPING_THRESHOLD", async () => {
      const order = makeOrder({
        subtotal: 200000,
        taxAmount: 38000,
        total: 238000,
        items: [
          { variantId: "v1", quantity: 5, weightGrams: 300 } as any,
        ],
      });
      vi.mocked(orderRepo.findByIdWithItems).mockResolvedValue(order);
      vi.mocked(getAllShippingRates).mockResolvedValue([
        {
          carrier: "coordinadora",
          service: "express",
          serviceDescription: "Express",
          deliveryEstimate: "1-3 dias",
          totalPrice: 12000,
          currency: "COP",
        },
      ]);

      const updatedOrder = makeOrder({
        subtotal: 200000,
        taxAmount: 38000,
        shippingAmount: 0,
        total: 238000,
        shippingCarrier: "coordinadora",
        shippingService: "express",
        items: [
          { variantId: "v1", quantity: 5, weightGrams: 300 } as any,
        ],
      });
      vi.mocked(orderRepo.updateShippingAndTotal).mockResolvedValue(updatedOrder);

      const result = await service.selectShipping("user-1", "order-1", {
        carrier: "coordinadora",
        service: "express",
      });

      expect(result.shippingAmount).toBe(0);
      expect(result.total).toBe(238000);
    });
  });

  describe("updateOrderAddress", () => {
    it("lanza NotFoundError si la orden no existe o pertenece a otro usuario", async () => {
      vi.mocked(orderRepo.findByIdWithItems).mockResolvedValue(null);

      await expect(
        service.updateOrderAddress("user-1", "order-1", { addressId: "addr-2" }),
      ).rejects.toThrow(NotFoundError);

      vi.mocked(orderRepo.findByIdWithItems).mockResolvedValue(
        makeOrder({ userId: "other-user" }),
      );
      await expect(
        service.updateOrderAddress("user-1", "order-1", { addressId: "addr-2" }),
      ).rejects.toThrow(NotFoundError);
    });

    it("lanza ConflictError si la orden no esta en estado PENDING", async () => {
      vi.mocked(orderRepo.findByIdWithItems).mockResolvedValue(
        makeOrder({ status: "PAID" }),
      );

      await expect(
        service.updateOrderAddress("user-1", "order-1", { addressId: "addr-2" }),
      ).rejects.toThrow(ConflictError);
    });

    it("lanza NotFoundError si la direccion no existe o pertenece a otro usuario", async () => {
      vi.mocked(orderRepo.findByIdWithItems).mockResolvedValue(makeOrder());
      vi.mocked(addressRepo.findById).mockResolvedValue(null);

      await expect(
        service.updateOrderAddress("user-1", "order-1", { addressId: "addr-2" }),
      ).rejects.toThrow(NotFoundError);

      vi.mocked(addressRepo.findById).mockResolvedValue({
        id: "addr-2",
        userId: "other-user",
      } as any);
      await expect(
        service.updateOrderAddress("user-1", "order-1", { addressId: "addr-2" }),
      ).rejects.toThrow(NotFoundError);
    });

    it("no cambia nada si la direccion ya esta seleccionada en la orden", async () => {
      vi.mocked(orderRepo.findByIdWithItems).mockResolvedValue(makeOrder());
      vi.mocked(addressRepo.findById).mockResolvedValue({
        id: "addr-1",
        userId: "user-1",
      } as any);

      const result = await service.updateOrderAddress("user-1", "order-1", {
        addressId: "addr-1",
      });

      expect(result.shippingAddressId).toBe("addr-1");
      expect(orderRepo.updateAddressAndResetShipping).not.toHaveBeenCalled();
    });

    it("exitoso: actualiza snapshot de direccion y resetea envio; total = subtotal + impuestos", async () => {
      const order = makeOrder({
        subtotal: 100000,
        taxAmount: 19000,
        total: 131000,
        shippingAddressId: "addr-1",
        shippingCarrier: "coordinadora",
        shippingService: "express",
        shippingAmount: 12000,
        shippingStatus: "LABEL_GENERATED",
      });
      vi.mocked(orderRepo.findByIdWithItems).mockResolvedValue(order);

      const mockAddress = {
        id: "addr-2",
        userId: "user-1",
        fullName: "Ana Gomez",
        phone: "3011111111",
        line1: "Carrera 7 # 45-10",
        line2: "Apto 302",
        city: "Bogota",
        state: "Cundinamarca",
        country: "CO",
        postalCode: "110111",
      };
      vi.mocked(addressRepo.findById).mockResolvedValue(mockAddress as any);

      const updatedOrder = makeOrder({
        subtotal: 100000,
        taxAmount: 19000,
        shippingAmount: 0,
        total: 119000,
        shippingAddressId: "addr-2",
        shippingFullName: "Ana Gomez",
        shippingPhone: "3011111111",
        shippingLine1: "Carrera 7 # 45-10",
        shippingLine2: "Apto 302",
        shippingCity: "Bogota",
        shippingState: "Cundinamarca",
        shippingCountry: "CO",
        shippingPostalCode: "110111",
        shippingCarrier: null,
        shippingService: null,
        shippingStatus: "PENDING",
      });
      vi.mocked(orderRepo.updateAddressAndResetShipping).mockResolvedValue(updatedOrder);

      const result = await service.updateOrderAddress("user-1", "order-1", {
        addressId: "addr-2",
      });

      expect(orderRepo.updateAddressAndResetShipping).toHaveBeenCalledWith("order-1", {
        shippingAddressId: "addr-2",
        shippingFullName: "Ana Gomez",
        shippingPhone: "3011111111",
        shippingLine1: "Carrera 7 # 45-10",
        shippingLine2: "Apto 302",
        shippingCity: "Bogota",
        shippingState: "Cundinamarca",
        shippingCountry: "CO",
        shippingPostalCode: "110111",
        total: 119000,
      });
      expect(result.shippingAddressId).toBe("addr-2");
      expect(result.shippingCarrier).toBeNull();
      expect(result.shippingAmount).toBe(0);
      expect(result.shippingStatus).toBe("PENDING");
      expect(result.total).toBe(119000);
    });
  });

  describe("listAllOrdersAdmin", () => {
    it("llama findAllAdmin (no findManyByUser) y mapea customerEmail/customerName", async () => {
      const order = makeAdminOrder({
        status: "PAID",
        items: [],
        user: { email: "customer@example.com", firstName: "Ana", lastName: "Gomez" },
      });
      vi.mocked(orderRepo.findAllAdmin).mockResolvedValue({ orders: [order], total: 1 });

      const result = await service.listAllOrdersAdmin({}, { page: 1, limit: 20 });

      expect(orderRepo.findAllAdmin).toHaveBeenCalledWith({}, { page: 1, limit: 20 });
      expect(orderRepo.findManyByUser).not.toHaveBeenCalled();
      expect(result.total).toBe(1);
      expect(result.items[0]).toMatchObject({
        id: "order-1",
        customerEmail: "customer@example.com",
        customerName: "Ana Gomez",
      });
    });

    it("filtra por status cuando se provee", async () => {
      vi.mocked(orderRepo.findAllAdmin).mockResolvedValue({ orders: [], total: 0 });

      await service.listAllOrdersAdmin({ status: "PAID" }, { page: 2, limit: 50 });

      expect(orderRepo.findAllAdmin).toHaveBeenCalledWith(
        { status: "PAID" },
        { page: 2, limit: 50 },
      );
    });

    it("propaga el search combinado con status", async () => {
      vi.mocked(orderRepo.findAllAdmin).mockResolvedValue({ orders: [], total: 0 });

      await service.listAllOrdersAdmin(
        { status: "PAID", search: "maria" },
        { page: 1, limit: 20 },
      );

      expect(orderRepo.findAllAdmin).toHaveBeenCalledWith(
        { status: "PAID", search: "maria" },
        { page: 1, limit: 20 },
      );
    });
  });

  describe("getOrderByIdAdmin", () => {
    it("lanza NotFoundError si la orden no existe", async () => {
      vi.mocked(orderRepo.findByIdAdmin).mockResolvedValue(null);

      await expect(service.getOrderByIdAdmin("order-1")).rejects.toThrow(NotFoundError);
    });

    it("devuelve el DTO con datos del cliente si la orden existe", async () => {
      const order = makeAdminOrder({
        status: "PAID",
        user: { email: "customer@example.com", firstName: "Ana", lastName: "Gomez" },
      });
      vi.mocked(orderRepo.findByIdAdmin).mockResolvedValue(order);

      const result = await service.getOrderByIdAdmin("order-1");

      expect(result.id).toBe("order-1");
      expect(result.status).toBe("PAID");
      expect(result.customerEmail).toBe("customer@example.com");
      expect(result.customerName).toBe("Ana Gomez");
    });
  });

  describe("updateOrderStatusAdmin", () => {
    it("PAID -> PROCESSING es valido y devuelve el DTO actualizado", async () => {
      const order = makeAdminOrder({ status: "PAID" });
      const updated = makeAdminOrder({ status: "PROCESSING" });
      vi.mocked(orderRepo.findByIdAdmin)
        .mockResolvedValueOnce(order)
        .mockResolvedValueOnce(updated);

      const result = await service.updateOrderStatusAdmin("order-1", "PROCESSING");

      expect(orderRepo.updateStatus).toHaveBeenCalledWith("order-1", "PROCESSING");
      expect(result.status).toBe("PROCESSING");
    });

    it("PENDING -> SHIPPED es invalido (status actual fuera de la progresion) -> ConflictError", async () => {
      vi.mocked(orderRepo.findByIdAdmin).mockResolvedValue(
        makeAdminOrder({ status: "PENDING" }),
      );

      await expect(
        service.updateOrderStatusAdmin("order-1", "SHIPPED"),
      ).rejects.toThrow(ConflictError);
      expect(orderRepo.updateStatus).not.toHaveBeenCalled();
    });

    it("DELIVERED -> PROCESSING es invalido (retroceder) -> ConflictError", async () => {
      vi.mocked(orderRepo.findByIdAdmin).mockResolvedValue(
        makeAdminOrder({ status: "DELIVERED" }),
      );

      await expect(
        service.updateOrderStatusAdmin("order-1", "PROCESSING"),
      ).rejects.toThrow(ConflictError);
      expect(orderRepo.updateStatus).not.toHaveBeenCalled();
    });

    it("PAID -> DELIVERED es un salto permitido hacia adelante -> exito", async () => {
      const order = makeAdminOrder({ status: "PAID" });
      const updated = makeAdminOrder({ status: "DELIVERED" });
      vi.mocked(orderRepo.findByIdAdmin)
        .mockResolvedValueOnce(order)
        .mockResolvedValueOnce(updated);

      const result = await service.updateOrderStatusAdmin("order-1", "DELIVERED");

      expect(orderRepo.updateStatus).toHaveBeenCalledWith("order-1", "DELIVERED");
      expect(result.status).toBe("DELIVERED");
    });
  });
});
