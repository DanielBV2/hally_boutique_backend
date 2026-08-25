import type { PrismaClient, Category } from "@prisma/client";

export interface Pagination {
  page: number;
  limit: number;
}

export interface CategoryRepository {
  findAllActive(): Promise<Category[]>;
  findAllAdmin(
    filters: { isActive?: boolean },
    pagination: Pagination,
  ): Promise<{ categories: Category[]; total: number }>;
  findBySlug(slug: string): Promise<Category | null>;
  findById(id: string): Promise<Category | null>;
  nameExists(name: string, excludeId?: string): Promise<boolean>;
  slugExists(slug: string): Promise<boolean>;
  countActiveProductsByCategory(categoryId: string): Promise<number>;
  create(data: { name: string; slug: string; description?: string | undefined }): Promise<Category>;
  update(
    id: string,
    data: Partial<{ name: string; slug: string; description: string }>,
  ): Promise<Category>;
  softDelete(id: string): Promise<void>;
}

export class PrismaCategoryRepository implements CategoryRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findAllActive() {
    return this.prisma.category.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
    });
  }

  async findAllAdmin(filters: { isActive?: boolean }, pagination: Pagination) {
    const where = filters.isActive !== undefined ? { isActive: filters.isActive } : {};

    const { page, limit } = pagination;
    const skip = (page - 1) * limit;

    const [categories, total] = await Promise.all([
      this.prisma.category.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
      }),
      this.prisma.category.count({ where }),
    ]);

    return { categories, total };
  }

  async findBySlug(slug: string) {
    return this.prisma.category.findFirst({
      where: { slug, isActive: true },
    });
  }

  async findById(id: string) {
    return this.prisma.category.findUnique({ where: { id } });
  }

  async nameExists(name: string, excludeId?: string) {
    const category = await this.prisma.category.findUnique({
      where: { name },
      select: { id: true },
    });
    if (!category) return false;
    if (excludeId && category.id === excludeId) return false;
    return true;
  }

  async slugExists(slug: string) {
    const category = await this.prisma.category.findUnique({
      where: { slug },
      select: { id: true },
    });
    return category !== null;
  }

  async countActiveProductsByCategory(categoryId: string) {
    return this.prisma.product.count({
      where: { categoryId, isActive: true },
    });
  }

  async create(data: { name: string; slug: string; description?: string }) {
    return this.prisma.category.create({ data });
  }

  async update(id: string, data: Partial<{ name: string; slug: string; description: string }>) {
    return this.prisma.category.update({ where: { id }, data });
  }

  async softDelete(id: string) {
    await this.prisma.category.update({
      where: { id },
      data: { isActive: false },
    });
  }
}
