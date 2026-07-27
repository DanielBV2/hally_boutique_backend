import { describe, it, expect, vi, beforeEach } from "vitest";

import { VariantServiceImpl } from "../../../src/modules/products/variant.service.js";
import type { VariantRepository } from "../../../src/modules/products/variant.repository.js";
import type { ProductRepository } from "../../../src/modules/products/product.repository.js";
import type { ProductWithRelations } from "../../../src/modules/products/product.repository.js";
import { ConflictError, NotFoundError, ValidationError } from "../../../src/shared/errors/app-error.js";

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
  });

  describe("deleteVariant", () => {
    it("llama a softDelete (isActive: false) y nunca a borrado físico", async () => {
      vi.mocked(productRepo.findById).mockResolvedValue(makeProduct());
      vi.mocked(variantRepo.findById).mockResolvedValue(makeVariant());

      await service.deleteVariant("prod-1", "var-1");

      expect(variantRepo.softDelete).toHaveBeenCalledWith("var-1");
      expect(variantRepo.softDelete).toHaveBeenCalledOnce();
    });

    it("lanza NotFoundError si el producto no existe", async () => {
      vi.mocked(productRepo.findById).mockResolvedValue(null);

      await expect(service.deleteVariant("nonexistent", "var-1")).rejects.toThrow(NotFoundError);
      expect(variantRepo.softDelete).not.toHaveBeenCalled();
    });

    it("lanza NotFoundError si la variante no existe o no pertenece al producto", async () => {
      vi.mocked(productRepo.findById).mockResolvedValue(makeProduct());
      vi.mocked(variantRepo.findById).mockResolvedValue(null);

      await expect(service.deleteVariant("prod-1", "var-1")).rejects.toThrow(NotFoundError);
      expect(variantRepo.softDelete).not.toHaveBeenCalled();
    });
  });
});
