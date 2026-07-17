import type { PrismaClient, Category } from "@prisma/client";

export interface CategoryRepository {
  findAllActive(): Promise<Category[]>;
  findBySlug(slug: string): Promise<Category | null>;
  findById(id: string): Promise<Category | null>;
  nameExists(name: string, excludeId?: string): Promise<boolean>;
  slugExists(slug: string): Promise<boolean>;
  countActiveProductsByCategory(categoryId: string): Promise<number>;
  create(data: {
    name: string;
    slug: string;
    description?: string | undefined;
  }): Promise<Category>;
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

  async update(
    id: string,
    data: Partial<{ name: string; slug: string; description: string }>,
  ) {
    return this.prisma.category.update({ where: { id }, data });
  }

  async softDelete(id: string) {
    await this.prisma.category.update({
      where: { id },
      data: { isActive: false },
    });
  }
}
