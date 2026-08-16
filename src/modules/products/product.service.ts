import type {
  ProductRepository,
  ProductFilters,
  Pagination,
  SortOptions,
  ProductWithRelations,
  ProductWithListRelations,
} from "./product.repository.js";
import type { ProductListItemDTO, ProductDetailDTO } from "./product.dto.js";
import { NotFoundError } from "../../shared/errors/app-error.js";
import { generateUniqueSlug } from "../../shared/utils/slugify.js";

interface CreateProductInput {
  name: string;
  description: string;
  basePrice: number;
  currency: string;
  weightGrams: number;
  categoryId: string;
}

interface UpdateProductInput {
  name?: string | undefined;
  description?: string | undefined;
  basePrice?: number | undefined;
  currency?: string | undefined;
  weightGrams?: number | undefined;
  categoryId?: string | undefined;
  isActive?: boolean | undefined;
}

interface AddImageInput {
  url: string;
  altText?: string | undefined;
  position: number;
}

export interface ProductService {
  listProducts(
    filters: ProductFilters,
    pagination: Pagination,
    sort: SortOptions,
  ): Promise<{ items: ProductListItemDTO[]; total: number; page: number }>;
  listProductsAdmin(
    filters: { isActive?: boolean; categoryId?: string; search?: string },
    pagination: Pagination,
  ): Promise<{ items: ProductListItemDTO[]; total: number }>;
  getProductBySlug(slug: string): Promise<ProductDetailDTO>;
  createProduct(data: CreateProductInput): Promise<ProductDetailDTO>;
  updateProduct(id: string, data: UpdateProductInput): Promise<ProductDetailDTO>;
  deleteProduct(id: string): Promise<void>;
  addProductImage(productId: string, data: AddImageInput): Promise<void>;
  removeProductImage(productId: string, imageId: string): Promise<void>;
}

function toListItemDTO(product: ProductWithListRelations): ProductListItemDTO {
  return {
    id: product.id,
    name: product.name,
    slug: product.slug,
    basePrice: Number(product.basePrice),
    currency: product.currency,
    thumbnailUrl: product.images[0]?.url ?? null,
    secondaryImageUrl: product.images[1]?.url ?? null,
    categoryName: product.category.name,
    images: product.images,
    hasStock: product.variants.some((v) => v.isActive && v.stock > 0),
    isActive: product.isActive,
  };
}

function toDetailDTO(product: ProductWithRelations): ProductDetailDTO {
  const basePrice = Number(product.basePrice);

  return {
    id: product.id,
    name: product.name,
    slug: product.slug,
    description: product.description,
    basePrice,
    currency: product.currency,
    weightGrams: product.weightGrams,
    category: product.category,
    images: product.images,
    variants: product.variants.filter((v) => v.isActive).map((v) => ({
      id: v.id,
      size: v.size,
      color: v.color,
      stock: v.stock,
      price: basePrice + Number(v.priceDelta),
      inStock: v.stock > 0,
    })),
  };
}

export class ProductServiceImpl implements ProductService {
  constructor(private readonly repository: ProductRepository) {}

  async listProducts(
    filters: ProductFilters,
    pagination: Pagination,
    sort: SortOptions,
  ) {
    const { products, total } = await this.repository.findMany(
      filters,
      pagination,
      sort,
    );

    return {
      items: products.map(toListItemDTO),
      total,
      page: pagination.page,
    };
  }

  async listProductsAdmin(
    filters: { isActive?: boolean; categoryId?: string; search?: string },
    pagination: Pagination,
  ) {
    const { products, total } = await this.repository.findManyAdmin(
      filters,
      pagination,
    );

    return {
      items: products.map(toListItemDTO),
      total,
    };
  }

  async getProductBySlug(slug: string) {
    const product = await this.repository.findBySlug(slug);
    if (!product) {
      throw new NotFoundError("Product");
    }
    return toDetailDTO(product);
  }

  async createProduct(data: CreateProductInput) {
    const categoryExists = await this.repository.categoryExists(
      data.categoryId,
    );
    if (!categoryExists) {
      throw new NotFoundError("Category");
    }

    const slug = await generateUniqueSlug(data.name, (slug) =>
      this.repository.slugExists(slug),
    );

    const product = await this.repository.create({ ...data, slug });
    return toDetailDTO(product);
  }

  async updateProduct(id: string, data: UpdateProductInput) {
    const existing = await this.repository.findById(id);
    if (!existing) {
      throw new NotFoundError("Product");
    }

    if (data.categoryId !== undefined) {
      const categoryExists = await this.repository.categoryExists(
        data.categoryId,
      );
      if (!categoryExists) {
        throw new NotFoundError("Category");
      }
    }

    const updateData: Record<string, string | number | boolean> = {};

    if (data.name !== undefined) updateData.name = data.name;
    if (data.description !== undefined) updateData.description = data.description;
    if (data.basePrice !== undefined) updateData.basePrice = data.basePrice;
    if (data.currency !== undefined) updateData.currency = data.currency;
    if (data.weightGrams !== undefined) updateData.weightGrams = data.weightGrams;
    if (data.categoryId !== undefined) updateData.categoryId = data.categoryId;
    if (data.isActive !== undefined) updateData.isActive = data.isActive;

    if (data.name !== undefined) {
      updateData.slug = await generateUniqueSlug(data.name, (slug) =>
        this.repository.slugExists(slug, id),
      );
    }

    const product = await this.repository.update(
      id,
      updateData as Partial<{
        name: string;
        slug: string;
        description: string;
        basePrice: number;
        currency: string;
        weightGrams: number;
        categoryId: string;
        isActive: boolean;
      }>,
    );
    return toDetailDTO(product);
  }

  async deleteProduct(id: string) {
    const existing = await this.repository.findById(id);
    if (!existing) {
      throw new NotFoundError("Product");
    }
    await this.repository.softDelete(id);
  }

  async addProductImage(productId: string, data: AddImageInput) {
    const existing = await this.repository.findById(productId);
    if (!existing) {
      throw new NotFoundError("Product");
    }
    await this.repository.addImage(productId, {
      url: data.url,
      altText: data.altText,
      position: data.position,
    });
  }

  async removeProductImage(productId: string, imageId: string) {
    const existing = await this.repository.findById(productId);
    if (!existing) {
      throw new NotFoundError("Product");
    }
    await this.repository.removeImage(productId, imageId);
  }
}
