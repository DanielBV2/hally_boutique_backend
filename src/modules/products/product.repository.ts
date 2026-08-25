import { type PrismaClient, type Prisma } from "@prisma/client";

export interface ProductFilters {
  categoryId: string | undefined;
  search: string | undefined;
  minPrice: number | undefined;
  maxPrice: number | undefined;
}

export interface Pagination {
  page: number;
  limit: number;
}

export interface SortOptions {
  sortBy: "createdAt" | "basePrice" | "name";
  sortOrder: "asc" | "desc";
}

export interface CreateProductData {
  name: string;
  slug: string;
  description: string;
  basePrice: number;
  currency: string;
  weightGrams: number;
  categoryId: string;
}

export interface AddImageData {
  url: string;
  altText?: string | undefined;
  position: number;
}

export type ProductWithRelations = Prisma.ProductGetPayload<{
  include: {
    category: { select: { id: true; name: true; slug: true } };
    images: { orderBy: { position: "asc" } };
    variants: true;
  };
}>;

export type ProductWithListRelations = Prisma.ProductGetPayload<{
  include: {
    category: { select: { name: true } };
    images: { orderBy: { position: "asc" }; take: 2 };
    variants: { select: { stock: true; isActive: true } };
  };
}>;

export interface ProductRepository {
  findMany(
    filters: ProductFilters,
    pagination: Pagination,
    sort: SortOptions,
  ): Promise<{ products: ProductWithListRelations[]; total: number }>;
  findManyAdmin(
    filters: { isActive?: boolean; categoryId?: string; search?: string },
    pagination: Pagination,
  ): Promise<{ products: ProductWithListRelations[]; total: number }>;
  findBySlug(slug: string): Promise<ProductWithRelations | null>;
  findById(id: string): Promise<ProductWithRelations | null>;
  slugExists(slug: string, excludeId?: string): Promise<boolean>;
  categoryExists(categoryId: string): Promise<boolean>;
  create(data: CreateProductData): Promise<ProductWithRelations>;
  update(id: string, data: Partial<CreateProductData>): Promise<ProductWithRelations>;
  softDelete(id: string): Promise<void>;
  addImage(
    productId: string,
    data: AddImageData,
  ): Promise<Prisma.ProductImageGetPayload<Record<string, never>>>;
  removeImage(productId: string, imageId: string): Promise<void>;
}

const includeFull = {
  category: { select: { id: true, name: true, slug: true } },
  images: { orderBy: { position: "asc" as const } },
  variants: true,
} satisfies Prisma.ProductInclude;

const includeList = {
  category: { select: { name: true } },
  images: { orderBy: { position: "asc" as const }, take: 2 },
  variants: { select: { stock: true, isActive: true } },
} satisfies Prisma.ProductInclude;

export class PrismaProductRepository implements ProductRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findMany(filters: ProductFilters, pagination: Pagination, sort: SortOptions) {
    const where = this.buildWhereClause(filters);
    const { page, limit } = pagination;
    const skip = (page - 1) * limit;

    const [products, total] = await Promise.all([
      this.prisma.product.findMany({
        where,
        include: includeList,
        orderBy: { [sort.sortBy]: sort.sortOrder },
        skip,
        take: limit,
      }),
      this.prisma.product.count({ where }),
    ]);

    return { products, total };
  }

  async findManyAdmin(
    filters: { isActive?: boolean; categoryId?: string; search?: string },
    pagination: Pagination,
  ) {
    const where: Prisma.ProductWhereInput = {};

    if (filters.isActive !== undefined) {
      where.isActive = filters.isActive;
    }
    if (filters.categoryId) {
      where.categoryId = filters.categoryId;
    }
    if (filters.search) {
      where.name = { contains: filters.search, mode: "insensitive" };
    }

    const { page, limit } = pagination;
    const skip = (page - 1) * limit;

    const [products, total] = await Promise.all([
      this.prisma.product.findMany({
        where,
        include: includeList,
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
      }),
      this.prisma.product.count({ where }),
    ]);

    return { products, total };
  }

  async findBySlug(slug: string) {
    return this.prisma.product.findFirst({
      where: { slug, isActive: true },
      include: includeFull,
    });
  }

  async findById(id: string) {
    return this.prisma.product.findUnique({
      where: { id },
      include: includeFull,
    });
  }

  async slugExists(slug: string, excludeId?: string) {
    const product = await this.prisma.product.findUnique({
      where: { slug },
      select: { id: true },
    });
    if (!product) return false;
    if (excludeId && product.id === excludeId) return false;
    return true;
  }

  async categoryExists(categoryId: string) {
    const category = await this.prisma.category.findUnique({
      where: { id: categoryId },
      select: { id: true },
    });
    return category !== null;
  }

  async create(data: CreateProductData) {
    return this.prisma.product.create({
      data,
      include: includeFull,
    });
  }

  async update(id: string, data: Partial<CreateProductData>) {
    return this.prisma.product.update({
      where: { id },
      data,
      include: includeFull,
    });
  }

  async softDelete(id: string) {
    await this.prisma.product.update({
      where: { id },
      data: { isActive: false },
    });
  }

  async addImage(productId: string, data: AddImageData) {
    return this.prisma.productImage.create({
      data: {
        productId,
        url: data.url,
        altText: data.altText ?? null,
        position: data.position,
      },
    });
  }

  async removeImage(productId: string, imageId: string) {
    const image = await this.prisma.productImage.findFirst({
      where: { id: imageId, productId },
    });
    if (!image) {
      const { NotFoundError } = await import("../../shared/errors/app-error.js");
      throw new NotFoundError("Image");
    }
    await this.prisma.productImage.delete({ where: { id: imageId } });
  }

  private buildWhereClause(filters: ProductFilters): Prisma.ProductWhereInput {
    const where: Prisma.ProductWhereInput = { isActive: true };

    if (filters.categoryId) {
      where.categoryId = filters.categoryId;
    }

    if (filters.search) {
      where.name = { contains: filters.search, mode: "insensitive" };
    }

    if (filters.minPrice !== undefined || filters.maxPrice !== undefined) {
      where.basePrice = {};
      if (filters.minPrice !== undefined) {
        where.basePrice.gte = filters.minPrice;
      }
      if (filters.maxPrice !== undefined) {
        where.basePrice.lte = filters.maxPrice;
      }
    }

    return where;
  }
}
