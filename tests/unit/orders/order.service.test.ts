import { describe, it, expect, vi, beforeEach } from "vitest";
import { OrderServiceImpl } from "../../../src/modules/orders/order.service.js";
import type { OrderRepository } from "../../../src/modules/orders/order.repository.js";
import type { CartRepository } from "../../../src/modules/cart/cart.repository.js";
import type { AddressRepository } from "../../../src/modules/addresses/address.repository.js";
import type { OrderWithItems } from "../../../src/modules/orders/order.types.js";
import type { CartWithItems } from "../../../src/modules/cart/cart.repository.js";
import { ValidationError, NotFoundError, ConflictError } from "../../../src/shared/errors/app-error.js";

function mockOrderRepo(): OrderRepository {
  return {
    findByIdempotencyKey: vi.fn(),
    findManyByUser: vi.fn(),
    findByIdWithItems: vi.fn(),
    createWithItems: vi.fn(),
    updateStatus: vi.fn(),
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
    shippingFullName: "Juan Pérez",
    shippingPhone: "3001234567",
    shippingLine1: "Calle 123",
    shippingLine2: null,
    shippingCity: "Medellín",
    shippingState: "Antioquia",
    shippingCountry: "CO",
    shippingPostalCode: "050001",
    idempotencyKey: "idem-key-1",
    createdAt: new Date("2026-01-01"),
    updatedAt: new Date("2026-01-01"),
    ...overrides,
    items: overrides.items ?? [],
  } as OrderWithItems;
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
        name: "Camiseta Básica",
        basePrice: 50000,
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
    orderRepo = mockOrderRepo();
    cartRepo = mockCartRepo();
    addressRepo = mockAddressRepo();
    service = new OrderServiceImpl(orderRepo, cartRepo, addressRepo);
  });

  describe("createOrderFromCart", () => {
    const userId = "user-1";
    const input = { addressId: "addr-1", idempotencyKey: "idem-key-1" };

    it("lanza ValidationError si el carrito está vacío", async () => {
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

    it("caso feliz: crea orden con snapshot correcto y totales válidos", async () => {
      vi.mocked(orderRepo.findByIdempotencyKey).mockResolvedValue(null);

      const mockAddress = {
        id: "addr-1",
        userId,
        fullName: "Juan Pérez",
        phone: "3001234567",
        line1: "Calle 123",
        line2: null,
        city: "Medellín",
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
          product: { name: "Camiseta", basePrice: 50000, images: [] },
        },
      });
      const item2 = makeCartItem({
        id: "cart-item-2",
        variantId: "v2",
        quantity: 1,
        variant: {
          id: "v2", size: "L", color: "Azul", stock: 5, priceDelta: 5000,
          product: { name: "Pantalón", basePrice: 80000, images: [] },
        },
      });

      vi.mocked(cartRepo.findOrCreateByUserId).mockResolvedValue({
        id: "cart-1", userId, items: [item1, item2],
      } as any);

      const created = makeOrder({
        subtotal: 180000,
        total: 180000,
        items: [
          { id: "oi-1", variantId: "v1", productName: "Camiseta", size: "M", color: "Rojo", unitPrice: 50000, quantity: 2, orderId: "order-1" },
          { id: "oi-2", variantId: "v2", productName: "Pantalón", size: "L", color: "Azul", unitPrice: 85000, quantity: 1, orderId: "order-1" },
        ] as any,
      });
      vi.mocked(orderRepo.createWithItems).mockResolvedValue(created);

      const result = await service.createOrderFromCart(userId, input);

      expect(result.subtotal).toBe(180000);
      expect(result.total).toBe(180000);
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
        productName: "Pantalón",
        size: "L",
        color: "Azul",
        unitPrice: 85000,
        quantity: 1,
        lineTotal: 85000,
      });

      expect(result.shippingFullName).toBe("Juan Pérez");
      expect(result.shippingPhone).toBe("3001234567");
      expect(result.shippingLine1).toBe("Calle 123");
      expect(result.shippingLine2).toBeNull();
      expect(result.shippingCity).toBe("Medellín");
      expect(result.shippingState).toBe("Antioquia");
      expect(result.shippingCountry).toBe("CO");
      expect(result.shippingPostalCode).toBe("050001");

      expect(orderRepo.createWithItems).toHaveBeenCalledOnce();
      const createCall = vi.mocked(orderRepo.createWithItems).mock.calls[0][0];
      expect(createCall.shippingFullName).toBe("Juan Pérez");
      expect(createCall.shippingPhone).toBe("3001234567");
      expect(createCall.shippingLine1).toBe("Calle 123");
      expect(createCall.shippingCity).toBe("Medellín");
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
});
