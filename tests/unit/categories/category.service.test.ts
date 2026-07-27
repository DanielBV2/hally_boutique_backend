import { describe, it, expect, vi, beforeEach } from "vitest";

import { CategoryServiceImpl } from "../../../src/modules/categories/category.service.js";
import type { CategoryRepository } from "../../../src/modules/categories/category.repository.js";
import type { Category } from "@prisma/client";
import { NotFoundError, ConflictError } from "../../../src/shared/errors/app-error.js";

function mockCategoryRepo(): CategoryRepository {
  return {
    findAllActive: vi.fn(),
    findBySlug: vi.fn(),
    findById: vi.fn(),
    nameExists: vi.fn(),
    slugExists: vi.fn(),
    countActiveProductsByCategory: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    softDelete: vi.fn(),
  };
}

function makeCategory(overrides: Partial<Category> = {}): Category {
  return {
    id: "cat-1",
    name: "Camisetas",
    slug: "camisetas",
    description: "Ropa casual",
    isActive: true,
    createdAt: new Date("2026-01-01"),
    updatedAt: new Date("2026-01-01"),
    ...overrides,
  };
}

describe("CategoryServiceImpl", () => {
  let categoryRepo: ReturnType<typeof mockCategoryRepo>;
  let service: CategoryServiceImpl;

  beforeEach(() => {
    vi.clearAllMocks();
    categoryRepo = mockCategoryRepo();
    service = new CategoryServiceImpl(categoryRepo);
  });

  describe("createCategory", () => {
    it("lanza ConflictError si el nombre ya existe, antes de generar slug o guardar", async () => {
      vi.mocked(categoryRepo.nameExists).mockResolvedValue(true);

      await expect(service.createCategory({ name: "Camisetas" })).rejects.toThrow(ConflictError);
      expect(categoryRepo.slugExists).not.toHaveBeenCalled();
      expect(categoryRepo.create).not.toHaveBeenCalled();
    });

    it("genera slug sin tildes ni caracteres especiales con generateUniqueSlug real", async () => {
      vi.mocked(categoryRepo.nameExists).mockResolvedValue(false);
      vi.mocked(categoryRepo.slugExists).mockResolvedValue(false);
      vi.mocked(categoryRepo.create).mockResolvedValue(makeCategory({ slug: "pantalon-deportivo" }));

      const result = await service.createCategory({ name: "Pantalón Deportivo" });

      expect(result.slug).toBe("pantalon-deportivo");
      expect(categoryRepo.slugExists).toHaveBeenCalledWith("pantalon-deportivo");
      expect(categoryRepo.create).toHaveBeenCalledOnce();
      const createCall = vi.mocked(categoryRepo.create).mock.calls[0][0];
      expect(createCall.slug).toBe("pantalon-deportivo");
    });

    it("genera slug con sufijo -2 cuando hay colisión en el slug base", async () => {
      vi.mocked(categoryRepo.nameExists).mockResolvedValue(false);
      vi.mocked(categoryRepo.slugExists)
        .mockResolvedValueOnce(true)
        .mockResolvedValueOnce(false);
      vi.mocked(categoryRepo.create).mockResolvedValue(makeCategory({ slug: "camisetas-2" }));

      const result = await service.createCategory({ name: "Camisetas" });

      expect(result.slug).toBe("camisetas-2");
      expect(categoryRepo.slugExists).toHaveBeenCalledWith("camisetas");
      expect(categoryRepo.slugExists).toHaveBeenCalledWith("camisetas-2");
    });
  });

  describe("listActive", () => {
    it("llama a repository.findAllActive y no a un método que traiga todas", async () => {
      vi.mocked(categoryRepo.findAllActive).mockResolvedValue([
        makeCategory({ id: "cat-1", name: "Camisetas" }),
        makeCategory({ id: "cat-2", name: "Pantalones" }),
      ]);

      const result = await service.listActive();

      expect(categoryRepo.findAllActive).toHaveBeenCalledOnce();
      expect(result).toHaveLength(2);
      expect(result[0].name).toBe("Camisetas");
      expect(result[1].name).toBe("Pantalones");
    });
  });

  describe("getBySlug", () => {
    it("lanza NotFoundError si el repository devuelve null", async () => {
      vi.mocked(categoryRepo.findBySlug).mockResolvedValue(null);

      await expect(service.getBySlug("no-existe")).rejects.toThrow(NotFoundError);
    });
  });

  describe("deleteCategory", () => {
    const catId = "cat-1";

    it("lanza ConflictError si tiene productos activos asociados y NO llama a softDelete", async () => {
      vi.mocked(categoryRepo.findById).mockResolvedValue(makeCategory({ id: catId }));
      vi.mocked(categoryRepo.countActiveProductsByCategory).mockResolvedValue(3);

      await expect(service.deleteCategory(catId)).rejects.toThrow(ConflictError);

      const error = await service.deleteCategory(catId).catch((e) => e);
      expect(error.message).toContain("productos activos");
      expect(categoryRepo.softDelete).not.toHaveBeenCalled();
    });

    it("llama a softDelete cuando no tiene productos activos asociados", async () => {
      vi.mocked(categoryRepo.findById).mockResolvedValue(makeCategory({ id: catId }));
      vi.mocked(categoryRepo.countActiveProductsByCategory).mockResolvedValue(0);

      await service.deleteCategory(catId);

      expect(categoryRepo.softDelete).toHaveBeenCalledWith(catId);
      expect(categoryRepo.softDelete).toHaveBeenCalledOnce();
    });

    it("lanza NotFoundError si la categoría no existe", async () => {
      vi.mocked(categoryRepo.findById).mockResolvedValue(null);

      await expect(service.deleteCategory("nonexistent")).rejects.toThrow(NotFoundError);
      expect(categoryRepo.softDelete).not.toHaveBeenCalled();
    });
  });
});
