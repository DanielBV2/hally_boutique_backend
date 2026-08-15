import { describe, it, expect, vi, beforeEach } from "vitest";

import { ProductServiceImpl } from "../../../src/modules/products/product.service.js";
import type { ProductRepository } from "../../../src/modules/products/product.repository.js";
import type { ProductWithRelations, ProductWithListRelations } from "../../../src/modules/products/product.repository.js";
import { NotFoundError } from "../../../src/shared/errors/app-error.js";

function mockProductRepo(): ProductRepository {
  return {
    findMany: vi.fn(),
    findManyAdmin: vi.fn(),
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
    description: "Una camiseta básica de algodón",
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

function makeListItem(overrides: Partial<ProductWithListRelations> = {}): ProductWithListRelations {
  return {
    id: "prod-1",
    name: "Camiseta Básica",
    slug: "camiseta-basica",
    description: "Una camiseta básica de algodón",
    basePrice: 50000,
    currency: "COP",
    categoryId: "cat-1",
    isActive: true,
    createdAt: new Date("2026-01-01"),
    updatedAt: new Date("2026-01-01"),
    category: { name: "Camisetas" },
    images: [],
    variants: [],
    ...overrides,
  } as unknown as ProductWithListRelations;
}

describe("ProductServiceImpl", () => {
  let productRepo: ReturnType<typeof mockProductRepo>;
  let service: ProductServiceImpl;

  beforeEach(() => {
    vi.clearAllMocks();
    productRepo = mockProductRepo();
    service = new ProductServiceImpl(productRepo);
  });

  describe("createProduct", () => {
    const input = {
      name: "Camiseta Básica",
      description: "Una camiseta básica de algodón para todos los días",
      basePrice: 50000,
      currency: "COP",
      categoryId: "cat-1",
    };

    it("genera slug con sufijo -2 cuando hay colisión en el slug base", async () => {
      vi.mocked(productRepo.categoryExists).mockResolvedValue(true);
      vi.mocked(productRepo.slugExists)
        .mockResolvedValueOnce(true)
        .mockResolvedValueOnce(false);
      vi.mocked(productRepo.create).mockResolvedValue(makeProduct({ slug: "camiseta-basica-2" }));

      const result = await service.createProduct(input);

      expect(result.slug).toBe("camiseta-basica-2");
      expect(productRepo.slugExists).toHaveBeenCalledWith("camiseta-basica");
      expect(productRepo.slugExists).toHaveBeenCalledWith("camiseta-basica-2");
      expect(productRepo.create).toHaveBeenCalledOnce();
      const createCall = vi.mocked(productRepo.create).mock.calls[0][0];
      expect(createCall.slug).toBe("camiseta-basica-2");
    });

    it("lanza NotFoundError('Category') si categoryId no existe", async () => {
      vi.mocked(productRepo.categoryExists).mockResolvedValue(false);

      await expect(service.createProduct(input)).rejects.toThrow(NotFoundError);
      expect(productRepo.create).not.toHaveBeenCalled();
    });
  });

  describe("listProducts", () => {
    it("llama a repository.findMany con los filtros, paginación y orden recibidos", async () => {
      const filters = { categoryId: undefined, search: undefined, minPrice: undefined, maxPrice: undefined };
      const pagination = { page: 1, limit: 20 };
      const sort = { sortBy: "createdAt" as const, sortOrder: "desc" as const };

      vi.mocked(productRepo.findMany).mockResolvedValue({ products: [makeListItem()], total: 1 });

      const result = await service.listProducts(filters, pagination, sort);

      expect(productRepo.findMany).toHaveBeenCalledWith(filters, pagination, sort);
      expect(result.items).toHaveLength(1);
      expect(result.total).toBe(1);
      expect(result.page).toBe(1);
    });

    it("expone hasStock en los items (true si hay al menos una variante activa con stock)", async () => {
      const filters = { categoryId: undefined, search: undefined, minPrice: undefined, maxPrice: undefined };
      const pagination = { page: 1, limit: 20 };
      const sort = { sortBy: "createdAt" as const, sortOrder: "desc" as const };

      vi.mocked(productRepo.findMany).mockResolvedValue({
        products: [
          makeListItem({ variants: [
            { stock: 0, isActive: true },
            { stock: 5, isActive: true },
          ] }),
          makeListItem({ id: "prod-2", variants: [
            { stock: 0, isActive: true },
          ] }),
          makeListItem({ id: "prod-3", variants: [
            { stock: 3, isActive: false },
          ] }),
        ],
        total: 3,
      });

      const result = await service.listProducts(filters, pagination, sort);

      expect(result.items[0].hasStock).toBe(true);
      expect(result.items[1].hasStock).toBe(false);
      expect(result.items[2].hasStock).toBe(false);
    });
  });

  describe("listProductsAdmin", () => {
    const pagination = { page: 1, limit: 20 };

    it("llama a repository.findManyAdmin con isActive undefined cuando no llega filtro", async () => {
      vi.mocked(productRepo.findManyAdmin).mockResolvedValue({ products: [makeListItem()], total: 1 });

      const result = await service.listProductsAdmin({ isActive: undefined, categoryId: undefined }, pagination);

      expect(productRepo.findManyAdmin).toHaveBeenCalledWith(
        { isActive: undefined, categoryId: undefined },
        pagination,
      );
      expect(productRepo.findManyAdmin).toHaveBeenCalledOnce();
      expect(result.items).toHaveLength(1);
      expect(result.total).toBe(1);
    });

    it("pasa isActive=false correctamente al repository", async () => {
      vi.mocked(productRepo.findManyAdmin).mockResolvedValue({ products: [], total: 0 });

      await service.listProductsAdmin({ isActive: false, categoryId: undefined }, pagination);

      expect(productRepo.findManyAdmin).toHaveBeenCalledWith(
        { isActive: false, categoryId: undefined },
        pagination,
      );
    });

    it("pasa isActive=true y categoryId correctamente al repository", async () => {
      vi.mocked(productRepo.findManyAdmin).mockResolvedValue({ products: [], total: 0 });

      await service.listProductsAdmin({ isActive: true, categoryId: "cat-1" }, pagination);

      expect(productRepo.findManyAdmin).toHaveBeenCalledWith(
        { isActive: true, categoryId: "cat-1" },
        pagination,
      );
    });
  });

  describe("getProductBySlug", () => {
    it("lanza NotFoundError si el repository devuelve null", async () => {
      vi.mocked(productRepo.findBySlug).mockResolvedValue(null);

      await expect(service.getProductBySlug("no-existe")).rejects.toThrow(NotFoundError);
    });

    it("calcula price e inStock correctamente para cada variante", async () => {
      const product = makeProduct({
        basePrice: 50000,
        variants: [
          { id: "v1", size: "M", color: "Rojo", stock: 5, priceDelta: 0, isActive: true } as any,
          { id: "v2", size: "L", color: "Azul", stock: 0, priceDelta: 10000, isActive: true } as any,
          { id: "v3", size: "S", color: "Verde", stock: 3, priceDelta: -5000, isActive: true } as any,
        ],
      });
      vi.mocked(productRepo.findBySlug).mockResolvedValue(product);

      const result = await service.getProductBySlug("camiseta-basica");

      expect(result.variants).toHaveLength(3);

      expect(result.variants[0]).toMatchObject({ id: "v1", size: "M", color: "Rojo", stock: 5, price: 50000, inStock: true });
      expect(result.variants[1]).toMatchObject({ id: "v2", size: "L", color: "Azul", stock: 0, price: 60000, inStock: false });
      expect(result.variants[2]).toMatchObject({ id: "v3", size: "S", color: "Verde", stock: 3, price: 45000, inStock: true });
    });

    it("filtra variantes inactivas del DTO", async () => {
      const product = makeProduct({
        basePrice: 50000,
        variants: [
          { id: "v1", size: "M", color: "Rojo", stock: 5, priceDelta: 0, isActive: true } as any,
          { id: "v2", size: "L", color: "Azul", stock: 3, priceDelta: 0, isActive: false } as any,
        ],
      });
      vi.mocked(productRepo.findBySlug).mockResolvedValue(product);

      const result = await service.getProductBySlug("camiseta-basica");

      expect(result.variants).toHaveLength(1);
      expect(result.variants[0].id).toBe("v1");
    });
  });

  describe("deleteProduct", () => {
    it("llama a softDelete (isActive: false) y nunca a borrado físico", async () => {
      vi.mocked(productRepo.findById).mockResolvedValue(makeProduct());

      await service.deleteProduct("prod-1");

      expect(productRepo.softDelete).toHaveBeenCalledWith("prod-1");
      expect(productRepo.softDelete).toHaveBeenCalledOnce();
    });

    it("lanza NotFoundError si el producto no existe", async () => {
      vi.mocked(productRepo.findById).mockResolvedValue(null);

      await expect(service.deleteProduct("nonexistent")).rejects.toThrow(NotFoundError);
      expect(productRepo.softDelete).not.toHaveBeenCalled();
    });
  });
});
