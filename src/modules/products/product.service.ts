import { Decimal } from "@prisma/client/runtime/client";
import type { CreateProductInput, UpdateProductInput, ListProductsQuery, AddProductImageInput } from "./product.schema.js";
import type { ProductListItemDTO, ProductDetailDTO } from "./product.dto.js";
import { NotFoundError, ConflictError, ValidationError } from "../../shared/errors/app-error.js";
import * as repo from "./product.repository.js";

// ─── Slug helpers ──────────────────────────────────────────────

function toSlug(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

async function generateUniqueSlug(baseSlug: string): Promise<string> {
  let slug = baseSlug;
  let suffix = 2;
  while (await repo.slugExists(slug)) {
    slug = `${baseSlug}-${suffix}`;
    suffix++;
  }
  return slug;
}

// ─── List ──────────────────────────────────────────────────────

export async function listProducts(query: ListProductsQuery) {
  const { page, limit, search, categoryId, sortBy, sortOrder } = query;
  const skip = (page - 1) * limit;

  const { products, total } = await repo.listActiveProducts({
    search,
    categoryId,
    sortBy,
    sortOrder,
    skip,
    take: limit,
  });

  const items: ProductListItemDTO[] = products.map((p) => ({
    id: p.id,
    name: p.name,
    slug: p.slug,
    description: p.description,
    basePrice: Number(p.basePrice),
    currency: p.currency,
    categoryName: p.category.name,
    mainImage: p.images[0]?.url ?? null,
    createdAt: p.createdAt,
  }));

  return {
    items,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
}

// ─── Detail ────────────────────────────────────────────────────

export async function getProductBySlug(slug: string): Promise<ProductDetailDTO> {
  const product = await repo.findProductBySlug(slug);

  if (!product || !product.isActive) {
    throw new NotFoundError("Producto");
  }

  return formatDetail(product);
}

// ─── Create ────────────────────────────────────────────────────

export async function createProduct(input: CreateProductInput) {
  // Validate category exists
  const category = await repo.findCategoryById(input.categoryId);
  if (!category) {
    throw new NotFoundError("Categoría");
  }

  // Validate SKUs uniqueness
  for (const v of input.variants) {
    const exists = await repo.skuExists(v.sku);
    if (exists) {
      throw new ConflictError(`El SKU "${v.sku}" ya está en uso`);
    }
  }

  // Generate unique slug from name
  const baseSlug = toSlug(input.name);
  const slug = await generateUniqueSlug(baseSlug);

  const product = await repo.createProduct({
    name: input.name,
    slug,
    description: input.description,
    basePrice: new Decimal(input.basePrice),
    currency: input.currency,
    categoryId: input.categoryId,
    variants: input.variants.map((v) => ({
      size: v.size,
      color: v.color,
      sku: v.sku,
      stock: v.stock,
      priceDelta: new Decimal(v.priceDelta),
    })),
    images: input.images,
  });

  return formatDetail(product);
}

// ─── Update ────────────────────────────────────────────────────

export async function updateProduct(id: string, input: UpdateProductInput) {
  const existing = await repo.findProductById(id);
  if (!existing) {
    throw new NotFoundError("Producto");
  }

  // Validate category if changing
  if (input.categoryId) {
    const category = await repo.findCategoryById(input.categoryId);
    if (!category) {
      throw new NotFoundError("Categoría");
    }
  }

  // Build product-level update data
  const productData: {
    name?: string;
    slug?: string;
    description?: string;
    basePrice?: Decimal;
    currency?: string;
    categoryId?: string;
  } = {};

  if (input.name !== undefined) {
    productData.name = input.name;
    const baseSlug = toSlug(input.name);
    productData.slug = await generateUniqueSlug(baseSlug);
  }
  if (input.description !== undefined) productData.description = input.description;
  if (input.basePrice !== undefined) productData.basePrice = new Decimal(input.basePrice);
  if (input.currency !== undefined) productData.currency = input.currency;
  if (input.categoryId !== undefined) productData.categoryId = input.categoryId;

  // Update product fields
  const updated = Object.keys(productData).length > 0
    ? await repo.updateProduct(id, productData)
    : existing;

  // Sync variants if provided
  if (input.variants) {
    // Validate SKUs
    for (const v of input.variants) {
      if (v.sku) {
        const exists = await repo.skuExists(v.sku, id);
        if (exists) {
          throw new ConflictError(`El SKU "${v.sku}" ya está en uso`);
        }
      }
    }

    // Replace all variants with the new set
    await repo.deleteVariantsByProductId(id);
    for (const v of input.variants) {
      if (!v.size || !v.color || !v.sku || v.stock === undefined) {
        throw new ValidationError("Cada variante debe incluir size, color, sku y stock");
      }
      await repo.upsertVariant({
        productId: id,
        size: v.size,
        color: v.color,
        sku: v.sku,
        stock: v.stock,
        priceDelta: new Decimal(v.priceDelta ?? 0),
      });
    }
  }

  // Re-fetch to return updated product with all relations
  const full = await repo.findProductById(id);
  if (!full) {
    throw new NotFoundError("Producto");
  }

  return formatDetail(full);
}

// ─── Soft Delete ───────────────────────────────────────────────

export async function deleteProduct(id: string) {
  const existing = await repo.findProductById(id);
  if (!existing) {
    throw new NotFoundError("Producto");
  }

  await repo.softDeleteProduct(id);
}

// ─── Add Image ─────────────────────────────────────────────────

export async function addImage(productId: string, input: AddProductImageInput) {
  const product = await repo.findProductById(productId);
  if (!product || !product.isActive) {
    throw new NotFoundError("Producto");
  }

  return repo.addProductImage(productId, {
    url: input.url,
    altText: input.altText ?? undefined,
    position: input.position,
  });
}

// ─── Remove Image ──────────────────────────────────────────────

export async function removeImage(productId: string, imageId: string) {
  const product = await repo.findProductById(productId);
  if (!product || !product.isActive) {
    throw new NotFoundError("Producto");
  }

  const image = await repo.findProductImage(imageId, productId);
  if (!image) {
    throw new NotFoundError("Imagen");
  }

  await repo.deleteProductImage(imageId);
}

// ─── Format detail with computed fields ────────────────────────

function formatDetail(product: {
  id: string;
  name: string;
  slug: string;
  description: string;
  basePrice: Decimal;
  currency: string;
  category: { id: string; name: string; slug: string };
  images: { id: string; url: string; altText: string | null; position: number }[];
  variants: {
    id: string;
    size: string;
    color: string;
    sku: string;
    stock: number;
    priceDelta: Decimal;
  }[];
  createdAt: Date;
}): ProductDetailDTO {
  const basePrice = Number(product.basePrice);

  return {
    id: product.id,
    name: product.name,
    slug: product.slug,
    description: product.description,
    basePrice,
    currency: product.currency,
    category: product.category,
    images: product.images.map((img) => ({
      id: img.id,
      url: img.url,
      altText: img.altText,
      position: img.position,
    })),
    variants: product.variants.map((v) => {
      const priceDelta = Number(v.priceDelta);
      const finalPrice = basePrice + priceDelta;
      return {
        id: v.id,
        size: v.size as ProductDetailDTO["variants"][number]["size"],
        color: v.color,
        sku: v.sku,
        stock: v.stock,
        priceDelta,
        finalPrice,
        inStock: v.stock > 0,
      };
    }),
    createdAt: product.createdAt,
  };
}
