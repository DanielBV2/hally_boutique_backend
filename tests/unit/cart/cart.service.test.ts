import { describe, it, expect, vi, beforeEach } from "vitest";

import { CartServiceImpl } from "../../../src/modules/cart/cart.service.js";
import type { CartRepository, CartWithItems } from "../../../src/modules/cart/cart.repository.js";
import { NotFoundError, ConflictError } from "../../../src/shared/errors/app-error.js";

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

function makeCart(userId: string, items: CartWithItems["items"] = []): CartWithItems {
  return {
    id: `cart-${userId}`,
    userId,
    createdAt: new Date("2026-01-01"),
    updatedAt: new Date("2026-01-01"),
    items,
  };
}

function makeCartItem(overrides: Record<string, unknown> = {}) {
  return {
    id: "item-1",
    cartId: "cart-user-1",
    variantId: "var-1",
    quantity: 2,
    createdAt: new Date("2026-01-01"),
    updatedAt: new Date("2026-01-01"),
    variant: {
      id: "var-1",
      productId: "prod-1",
      size: "M",
      color: "Rojo",
      sku: "CAM-M-ROJO",
      stock: 10,
      priceDelta: 0,
      isActive: true,
      createdAt: new Date("2026-01-01"),
      updatedAt: new Date("2026-01-01"),
      product: {
        id: "prod-1",
        name: "Camiseta Básica",
        slug: "camiseta-basica",
        basePrice: 50000,
        currency: "COP",
        images: [{ url: "https://example.com/img.jpg" }],
      },
    },
    ...overrides,
  };
}

describe("CartServiceImpl", () => {
  let cartRepo: ReturnType<typeof mockCartRepo>;
  let service: CartServiceImpl;

  beforeEach(() => {
    vi.clearAllMocks();
    cartRepo = mockCartRepo();
    service = new CartServiceImpl(cartRepo);
  });

  describe("addItem", () => {
    it("lanza NotFoundError si la variante no existe", async () => {
      vi.mocked(cartRepo.findVariantById).mockResolvedValue(null);

      await expect(service.addItem("user-1", { variantId: "var-1", quantity: 1 })).rejects.toThrow(
        NotFoundError,
      );
      expect(cartRepo.findOrCreateByUserId).not.toHaveBeenCalled();
    });

    it("lanza ConflictError si la variante está inactiva", async () => {
      vi.mocked(cartRepo.findVariantById).mockResolvedValue({
        id: "var-1",
        isActive: false,
        stock: 10,
      });

      await expect(service.addItem("user-1", { variantId: "var-1", quantity: 1 })).rejects.toThrow(
        ConflictError,
      );
      expect(cartRepo.findOrCreateByUserId).not.toHaveBeenCalled();
    });

    it("lanza ConflictError con stock disponible cuando quantity excede stock", async () => {
      vi.mocked(cartRepo.findVariantById).mockResolvedValue({
        id: "var-1",
        isActive: true,
        stock: 3,
      });
      vi.mocked(cartRepo.findOrCreateByUserId).mockResolvedValue(makeCart("user-1"));

      const error = await service
        .addItem("user-1", { variantId: "var-1", quantity: 5 })
        .catch((e) => e);

      expect(error).toBeInstanceOf(ConflictError);
      expect(error.message).toContain("Disponible: 3");
    });

    it("llama a upsertItem con incremento sobre cantidad existente", async () => {
      const existingItem = makeCartItem({ quantity: 2 });
      vi.mocked(cartRepo.findVariantById).mockResolvedValue({
        id: "var-1",
        isActive: true,
        stock: 10,
      });
      vi.mocked(cartRepo.findOrCreateByUserId)
        .mockResolvedValueOnce(makeCart("user-1", [existingItem]))
        .mockResolvedValueOnce(makeCart("user-1", [makeCartItem({ quantity: 5 })]));

      await service.addItem("user-1", { variantId: "var-1", quantity: 3 });

      expect(cartRepo.upsertItem).toHaveBeenCalledWith("cart-user-1", "var-1", 3);
      expect(cartRepo.upsertItem).toHaveBeenCalledOnce();
    });
  });

  describe("updateItemQuantity", () => {
    it("lanza NotFoundError si el item pertenece a otro usuario", async () => {
      vi.mocked(cartRepo.findOrCreateByUserId).mockResolvedValue(makeCart("user-1"));
      vi.mocked(cartRepo.findItemById).mockResolvedValue({
        id: "item-1",
        cartId: "cart-other-user",
        variantId: "var-1",
        quantity: 1,
        variant: { id: "var-1", isActive: true, stock: 10 },
      });

      await expect(service.updateItemQuantity("user-1", "item-1", { quantity: 5 })).rejects.toThrow(
        NotFoundError,
      );
      expect(cartRepo.updateItemQuantity).not.toHaveBeenCalled();
    });
  });

  describe("removeItem", () => {
    it("lanza NotFoundError si el item pertenece a otro usuario", async () => {
      vi.mocked(cartRepo.findOrCreateByUserId).mockResolvedValue(makeCart("user-1"));
      vi.mocked(cartRepo.findItemById).mockResolvedValue({
        id: "item-1",
        cartId: "cart-other-user",
        variantId: "var-1",
        quantity: 1,
        variant: { id: "var-1", isActive: true, stock: 10 },
      });

      await expect(service.removeItem("user-1", "item-1")).rejects.toThrow(NotFoundError);
      expect(cartRepo.removeItem).not.toHaveBeenCalled();
    });
  });

  describe("getCart", () => {
    it("calcula unitPrice y subtotal a partir de basePrice + priceDelta, no de campos almacenados", async () => {
      const item = makeCartItem({
        quantity: 3,
        variant: {
          id: "var-1",
          productId: "prod-1",
          size: "M",
          color: "Rojo",
          stock: 10,
          priceDelta: 5000,
          isActive: true,
          product: {
            id: "prod-1",
            name: "Camiseta Básica",
            slug: "camiseta-basica",
            basePrice: 50000,
            images: [],
          },
        },
      });

      vi.mocked(cartRepo.findOrCreateByUserId).mockResolvedValue(makeCart("user-1", [item]));

      const result = await service.getCart("user-1");

      expect(result.items[0].unitPrice).toBe(55000);
      expect(result.items[0].subtotal).toBe(165000);
      expect(result.subtotal).toBe(165000);
    });

    it("marca isAvailable: false si variante quedó inactiva o sin stock, pero mantiene el item", async () => {
      const item = makeCartItem({
        quantity: 1,
        variant: {
          id: "var-1",
          productId: "prod-1",
          size: "M",
          color: "Rojo",
          stock: 0,
          priceDelta: 0,
          isActive: false,
          product: {
            id: "prod-1",
            name: "Camiseta Básica",
            slug: "camiseta-basica",
            basePrice: 50000,
            images: [],
          },
        },
      });

      vi.mocked(cartRepo.findOrCreateByUserId).mockResolvedValue(makeCart("user-1", [item]));

      const result = await service.getCart("user-1");

      expect(result.items).toHaveLength(1);
      expect(result.items[0].isAvailable).toBe(false);
      expect(result.items[0].id).toBe("item-1");
    });
  });
});
