import type { Category } from "@prisma/client";
import type { CategoryRepository } from "./category.repository.js";
import type { CategoryDTO } from "./category.dto.js";
import {
  NotFoundError,
  ConflictError,
} from "../../shared/errors/app-error.js";
import {
  generateUniqueSlug,
} from "../../shared/utils/slugify.js";

interface CreateCategoryInput {
  name: string;
  description?: string | undefined;
}

interface UpdateCategoryInput {
  name?: string | undefined;
  description?: string | undefined;
}

export interface CategoryService {
  listActive(): Promise<CategoryDTO[]>;
  getBySlug(slug: string): Promise<CategoryDTO>;
  getById(id: string): Promise<CategoryDTO>;
  createCategory(data: CreateCategoryInput): Promise<CategoryDTO>;
  updateCategory(id: string, data: UpdateCategoryInput): Promise<CategoryDTO>;
  deleteCategory(id: string): Promise<void>;
}

function toDTO(category: Category): CategoryDTO {
  return {
    id: category.id,
    name: category.name,
    slug: category.slug,
    description: category.description,
  };
}

export class CategoryServiceImpl implements CategoryService {
  constructor(private readonly repository: CategoryRepository) {}

  async listActive() {
    const categories = await this.repository.findAllActive();
    return categories.map(toDTO);
  }

  async getBySlug(slug: string) {
    const category = await this.repository.findBySlug(slug);
    if (!category) {
      throw new NotFoundError("Category");
    }
    return toDTO(category);
  }

  async getById(id: string) {
    const category = await this.repository.findById(id);
    if (!category || !category.isActive) {
      throw new NotFoundError("Category");
    }
    return toDTO(category);
  }

  async createCategory(data: CreateCategoryInput) {
    const nameTaken = await this.repository.nameExists(data.name);
    if (nameTaken) {
      throw new ConflictError("Ya existe una categoría con ese nombre");
    }

    const slug = await generateUniqueSlug(data.name, (slug) =>
      this.repository.slugExists(slug),
    );

    const category = await this.repository.create({
      name: data.name,
      slug,
      description: data.description,
    });
    return toDTO(category);
  }

  async updateCategory(id: string, data: UpdateCategoryInput) {
    const existing = await this.repository.findById(id);
    if (!existing || !existing.isActive) {
      throw new NotFoundError("Category");
    }

    if (data.name !== undefined) {
      const nameTaken = await this.repository.nameExists(data.name, id);
      if (nameTaken) {
        throw new ConflictError("Ya existe una categoría con ese nombre");
      }
    }

    const updateData: Partial<{ name: string; slug: string; description: string }> = {};

    if (data.name !== undefined) updateData.name = data.name;
    if (data.description !== undefined) updateData.description = data.description;

    if (data.name !== undefined) {
      updateData.slug = await generateUniqueSlug(data.name, (slug) =>
        this.repository.slugExists(slug),
      );
    }

    const category = await this.repository.update(id, updateData);
    return toDTO(category);
  }

  async deleteCategory(id: string) {
    const existing = await this.repository.findById(id);
    if (!existing || !existing.isActive) {
      throw new NotFoundError("Category");
    }

    const activeProducts = await this.repository.countActiveProductsByCategory(id);
    if (activeProducts > 0) {
      throw new ConflictError(
        "No se puede desactivar una categoría con productos activos asociados",
      );
    }

    await this.repository.softDelete(id);
  }
}
