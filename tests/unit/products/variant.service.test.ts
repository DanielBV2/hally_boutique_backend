import { describe, it, expect, vi, beforeEach } from "vitest";

import { VariantServiceImpl } from "../../../src/modules/products/variant.service.js";
import type { VariantRepository } from "../../../src/modules/products/variant.repository.js";
import type { ProductRepository } from "../../../src/modules/products/product.repository.js";
import type { ProductWithRelations } from "../../../src/modules/products/product.repository.js";
import {
  ConflictError,
  NotFoundError,
  ValidationError,
} from "../../../src/shared/errors/app-error.js";

function mockVariantRepo(): VariantRepository {
  return {
    findAllByProduct: vi.fn(),
    findById: vi.fn(),
    existsCombination: vi.fn(),
    skuExists: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    softDelete: vi.fn(),
    decrementStockIfAvailable: vi.fn(),
  };
}

function mockProductRepo(): ProductRepository {
  return {
    findMany: vi.fn(),
    findBySlug: vi.fn(),
    findById: vi.fn(),
    slugExists: vi.fn(),
    categoryExists: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    softDelete: vi.fn(),
    addImage: vi.fn(),
    removeImage: vi.fn(),
  };
}

function makeProduct(overrides: Partial<ProductWithRelations> = {}): ProductWithRelations {
  return {
    id: "prod-1",
    name: "Camiseta Básica",
    slug: "camiseta-basica",
    description: "Una camiseta básica",
    basePrice: 50000,
    currency: "COP",
    categoryId: "cat-1",
    isActive: true,
    createdAt: new Date("2026-01-01"),
    updatedAt: new Date("2026-01-01"),
    category: { id: "cat-1", name: "Camisetas", slug: "camisetas" },
    images: [],
    variants: [],
    ...overrides,
  } as ProductWithRelations;
}

function makeVariant(overrides: Record<string, unknown> = {}) {
  return {
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
    ...overrides,
  };
}

describe("VariantServiceImpl", () => {
  let variantRepo: ReturnType<typeof mockVariantRepo>;
  let productRepo: ReturnType<typeof mockProductRepo>;
  let service: VariantServiceImpl;

  beforeEach(() => {
    vi.clearAllMocks();
    variantRepo = mockVariantRepo();
    productRepo = mockProductRepo();
    service = new VariantServiceImpl(variantRepo, productRepo);
  });

  describe("createVariant", () => {
    const productId = "prod-1";
    const input = {
      size: "M",
      color: "Rojo",
      sku: "CAM-M-ROJO",
      stock: 10,
      priceDelta: 0,
    };

    it("lanza ConflictError si la combinación size+color ya existe", async () => {
      vi.mocked(productRepo.findById).mockResolvedValue(makeProduct());
      vi.mocked(variantRepo.existsCombination).mockResolvedValue(true);

      await expect(service.createVariant(productId, input)).rejects.toThrow(ConflictError);

      const error = await service.createVariant(productId, input).catch((e) => e);
      expect(error.message).toContain("talla M");
      expect(error.message).toContain("color Rojo");
    });

    it("lanza ConflictError si el sku ya está en uso", async () => {
      vi.mocked(productRepo.findById).mockResolvedValue(makeProduct());
      vi.mocked(variantRepo.existsCombination).mockResolvedValue(false);
      vi.mocked(variantRepo.skuExists).mockResolvedValue(true);

      await expect(service.createVariant(productId, input)).rejects.toThrow(ConflictError);

      const error = await service.createVariant(productId, input).catch((e) => e);
      expect(error.message).toContain("CAM-M-ROJO");
    });

    it("lanza ValidationError si basePrice + priceDelta <= 0", async () => {
      vi.mocked(productRepo.findById).mockResolvedValue(makeProduct({ basePrice: 50000 }));
      vi.mocked(variantRepo.existsCombination).mockResolvedValue(false);
      vi.mocked(variantRepo.skuExists).mockResolvedValue(false);

      await expect(
        service.createVariant(productId, { ...input, priceDelta: -60000 }),
      ).rejects.toThrow(ValidationError);

      expect(variantRepo.create).not.toHaveBeenCalled();
    });

    it("lanza NotFoundError si el producto no existe o está inactivo", async () => {
      vi.mocked(productRepo.findById).mockResolvedValue(null);

      await expect(service.createVariant(productId, input)).rejects.toThrow(NotFoundError);
      expect(variantRepo.create).not.toHaveBeenCalled();
    });

    it("lanza NotFoundError si el producto está inactivo", async () => {
      vi.mocked(productRepo.findById).mockResolvedValue(makeProduct({ isActive: false }));

      await expect(service.createVariant(productId, input)).rejects.toThrow(NotFoundError);
      expect(variantRepo.create).not.toHaveBeenCalled();
    });

    it("genera el SKU desde nombre + color + talla si no se envía", async () => {
      vi.mocked(productRepo.findById).mockResolvedValue(makeProduct({ name: "Camisa Oxford" }));
      vi.mocked(variantRepo.existsCombination).mockResolvedValue(false);
      vi.mocked(variantRepo.skuExists).mockResolvedValue(false);
      vi.mocked(variantRepo.create).mockResolvedValue(makeVariant());

      const rest = {
        size: input.size,
        color: input.color,
        stock: input.stock,
        priceDelta: input.priceDelta,
      };
      await service.createVariant(productId, rest);

      expect(variantRepo.skuExists).toHaveBeenCalledWith("CAM-OXF-RO-M");
      expect(variantRepo.create).toHaveBeenCalledWith(
        productId,
        expect.objectContaining({ sku: "CAM-OXF-RO-M" }),
      );
    });

    it("agrega sufijo numérico al SKU generado si ya existe", async () => {
      vi.mocked(productRepo.findById).mockResolvedValue(makeProduct({ name: "Camisa Oxford" }));
      vi.mocked(variantRepo.existsCombination).mockResolvedValue(false);
      vi.mocked(variantRepo.skuExists).mockResolvedValueOnce(true).mockResolvedValueOnce(false);
      vi.mocked(variantRepo.create).mockResolvedValue(makeVariant());

      const rest = {
        size: input.size,
        color: input.color,
        stock: input.stock,
        priceDelta: input.priceDelta,
      };
      await service.createVariant(productId, rest);

      expect(variantRepo.skuExists).toHaveBeenNthCalledWith(1, "CAM-OXF-RO-M");
      expect(variantRepo.skuExists).toHaveBeenNthCalledWith(2, "CAM-OXF-RO-M2");
      expect(variantRepo.create).toHaveBeenCalledWith(
        productId,
        expect.objectContaining({ sku: "CAM-OXF-RO-M2" }),
      );
    });

    it("mantiene el SKU manual sin modificarlo", async () => {
      vi.mocked(productRepo.findById).mockResolvedValue(makeProduct({ name: "Camisa Oxford" }));
      vi.mocked(variantRepo.existsCombination).mockResolvedValue(false);
      vi.mocked(variantRepo.skuExists).mockResolvedValue(false);
      vi.mocked(variantRepo.create).mockResolvedValue(makeVariant());

      await service.createVariant(productId, { ...input, sku: "SKU-MANUAL" });

      expect(variantRepo.skuExists).toHaveBeenCalledWith("SKU-MANUAL");
      expect(variantRepo.create).toHaveBeenCalledWith(
        productId,
        expect.objectContaining({ sku: "SKU-MANUAL" }),
      );
    });
  });

  describe("updateVariant", () => {
    it("setea la auditoría de desactivación cuando isActive es false", async () => {
      vi.mocked(productRepo.findById).mockResolvedValue(makeProduct());
      vi.mocked(variantRepo.findById).mockResolvedValue(makeVariant());
      vi.mocked(variantRepo.update).mockResolvedValue(makeVariant());

      await service.updateVariant("prod-1", "var-1", { isActive: false }, "admin-1");

      expect(variantRepo.update).toHaveBeenCalledWith(
        "var-1",
        expect.objectContaining({
          isActive: false,
          deactivatedById: "admin-1",
        }),
      );
      const updateData = vi.mocked(variantRepo.update).mock.calls[0][1] as Record<string, unknown>;
      expect(updateData.deactivatedAt).toBeInstanceOf(Date);
      expect(updateData.deactivatedById).toBe("admin-1");
    });

    it("limpia deactivatedAt/deactivatedById al reactivar (isActive: true)", async () => {
      vi.mocked(productRepo.findById).mockResolvedValue(makeProduct());
      vi.mocked(variantRepo.findById).mockResolvedValue(makeVariant());
      vi.mocked(variantRepo.update).mockResolvedValue(makeVariant());

      await service.updateVariant("prod-1", "var-1", { isActive: true }, "admin-1");

      expect(variantRepo.update).toHaveBeenCalledWith(
        "var-1",
        expect.objectContaining({
          isActive: true,
          deactivatedAt: null,
          deactivatedById: null,
        }),
      );
    });

    it("no agrega auditoría si no se envía isActive", async () => {
      vi.mocked(productRepo.findById).mockResolvedValue(makeProduct());
      vi.mocked(variantRepo.findById).mockResolvedValue(makeVariant());
      vi.mocked(variantRepo.update).mockResolvedValue(makeVariant());

      await service.updateVariant("prod-1", "var-1", { stock: 5 }, "admin-1");

      expect(variantRepo.update).toHaveBeenCalledWith(
        "var-1",
        expect.objectContaining({ stock: 5 }),
      );
      const updateData = vi.mocked(variantRepo.update).mock.calls[0][1] as Record<string, unknown>;
      expect(updateData.deactivatedAt).toBeUndefined();
      expect(updateData.deactivatedById).toBeUndefined();
    });

    it("lanza NotFoundError si la variante no pertenece al producto", async () => {
      vi.mocked(productRepo.findById).mockResolvedValue(makeProduct());
      vi.mocked(variantRepo.findById).mockResolvedValue(makeVariant({ productId: "otro-prod" }));

      await expect(
        service.updateVariant("prod-1", "var-1", { isActive: false }, "admin-1"),
      ).rejects.toThrow(NotFoundError);
      expect(variantRepo.update).not.toHaveBeenCalled();
    });
  });

  describe("deleteVariant", () => {
    it("llama a softDelete (isActive: false) y nunca a borrado físico", async () => {
      vi.mocked(productRepo.findById).mockResolvedValue(makeProduct());
      vi.mocked(variantRepo.findById).mockResolvedValue(makeVariant());

      await service.deleteVariant("prod-1", "var-1", "admin-1");

      expect(variantRepo.softDelete).toHaveBeenCalledWith("var-1", "admin-1");
      expect(variantRepo.softDelete).toHaveBeenCalledOnce();
    });

    it("lanza NotFoundError si el producto no existe", async () => {
      vi.mocked(productRepo.findById).mockResolvedValue(null);

      await expect(service.deleteVariant("nonexistent", "var-1", "admin-1")).rejects.toThrow(
        NotFoundError,
      );
      expect(variantRepo.softDelete).not.toHaveBeenCalled();
    });

    it("lanza NotFoundError si la variante no existe o no pertenece al producto", async () => {
      vi.mocked(productRepo.findById).mockResolvedValue(makeProduct());
      vi.mocked(variantRepo.findById).mockResolvedValue(null);

      await expect(service.deleteVariant("prod-1", "var-1", "admin-1")).rejects.toThrow(
        NotFoundError,
      );
      expect(variantRepo.softDelete).not.toHaveBeenCalled();
    });
  });
});
