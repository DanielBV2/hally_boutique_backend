import type { Prisma, Product, ProductImage, Variant } from "@prisma/client";
import { prisma } from "../../config/prisma.js";

// ─── Find helpers (used by service for validation) ─────────────

export async function findCategoryById(id: string): Promise<{ id: string; name: string } | null> {
  return prisma.category.findUnique({
    where: { id },
    select: { id: true, name: true },
  });
}

export async function findProductBySlug(slug: string): Promise<
  | (Product & {
      category: { id: string; name: string; slug: string };
      images: ProductImage[];
      variants: Variant[];
    })
  | null
> {
  return prisma.product.findUnique({
    where: { slug },
    include: {
      category: { select: { id: true, name: true, slug: true } },
      images: { orderBy: { position: "asc" } },
      variants: { orderBy: { createdAt: "asc" } },
    },
  });
}

export async function findProductById(id: string): Promise<
  | (Product & {
      category: { id: string; name: string; slug: string };
      images: ProductImage[];
      variants: Variant[];
    })
  | null
> {
  return prisma.product.findUnique({
    where: { id },
    include: {
      category: { select: { id: true, name: true, slug: true } },
      images: { orderBy: { position: "asc" } },
      variants: { orderBy: { createdAt: "asc" } },
    },
  });
}

export async function findProductByIdActive(id: string) {
  return prisma.product.findFirst({
    where: { id, isActive: true },
    include: {
      category: { select: { id: true, name: true, slug: true } },
      images: { orderBy: { position: "asc" } },
      variants: { orderBy: { createdAt: "asc" } },
    },
  });
}

// ─── Slug collision check ──────────────────────────────────────

export async function slugExists(slug: string): Promise<boolean> {
  const count = await prisma.product.count({ where: { slug } });
  return count > 0;
}

// ─── SKU collision check ───────────────────────────────────────

export async function skuExists(sku: string, excludeProductId?: string): Promise<boolean> {
  const where: Prisma.VariantWhereInput = { sku };
  if (excludeProductId) {
    where.product = { id: { not: excludeProductId } };
  }
  const count = await prisma.variant.count({ where });
  return count > 0;
}

// ─── LIST with filtering / sorting / pagination ────────────────

export interface ListProductsParams {
  search: string | null | undefined;
  categoryId: string | null | undefined;
  sortBy: "name" | "basePrice" | "createdAt";
  sortOrder: "asc" | "desc";
  skip: number;
  take: number;
}

export async function listActiveProducts(params: ListProductsParams) {
  const { search, categoryId, sortBy, sortOrder, skip, take } = params;

  const where: Prisma.ProductWhereInput = {
    isActive: true,
    ...(search && {
      OR: [
        { name: { contains: search, mode: "insensitive" } },
        { description: { contains: search, mode: "insensitive" } },
      ],
    }),
    ...(categoryId && { categoryId }),
  };

  const orderBy: Prisma.ProductOrderByWithRelationInput = {
    [sortBy]: sortOrder,
  };

  const [products, total] = await Promise.all([
    prisma.product.findMany({
      where,
      orderBy,
      skip,
      take,
      include: {
        category: { select: { name: true } },
        images: { take: 1, orderBy: { position: "asc" } },
      },
    }),
    prisma.product.count({ where }),
  ]);

  return { products, total };
}

// ─── CREATE ────────────────────────────────────────────────────

export async function createProduct(data: {
  name: string;
  slug: string;
  description: string;
  basePrice: Prisma.Decimal;
  currency: string;
  categoryId: string;
  variants: {
    size: Variant["size"];
    color: string;
    sku: string;
    stock: number;
    priceDelta: Prisma.Decimal;
  }[];
  images?: { url: string; altText?: string | undefined; position: number }[] | undefined;
}) {
  return prisma.product.create({
    data: {
      name: data.name,
      slug: data.slug,
      description: data.description,
      basePrice: data.basePrice,
      currency: data.currency,
      categoryId: data.categoryId,
      variants: {
        create: data.variants.map((v) => ({
          size: v.size,
          color: v.color,
          sku: v.sku,
          stock: v.stock,
          priceDelta: v.priceDelta,
        })),
      },
      ...(data.images && {
        images: {
          create: data.images.map((img) => ({
            url: img.url,
            altText: img.altText ?? null,
            position: img.position,
          })),
        },
      }),
    },
    include: {
      category: { select: { id: true, name: true, slug: true } },
      images: { orderBy: { position: "asc" } },
      variants: { orderBy: { createdAt: "asc" } },
    },
  });
}

// ─── UPDATE ────────────────────────────────────────────────────

export async function updateProduct(
  id: string,
  data: {
    name?: string;
    slug?: string;
    description?: string;
    basePrice?: Prisma.Decimal;
    currency?: string;
    categoryId?: string;
  },
) {
  return prisma.product.update({
    where: { id },
    data,
    include: {
      category: { select: { id: true, name: true, slug: true } },
      images: { orderBy: { position: "asc" } },
      variants: { orderBy: { createdAt: "asc" } },
    },
  });
}

// ─── SOFT DELETE ───────────────────────────────────────────────

export async function softDeleteProduct(id: string) {
  return prisma.product.update({
    where: { id },
    data: { isActive: false },
  });
}

// ─── IMAGE operations ──────────────────────────────────────────

export async function addProductImage(
  productId: string,
  data: { url: string; altText: string | undefined; position: number },
) {
  return prisma.productImage.create({
    data: {
      productId,
      url: data.url,
      altText: data.altText ?? null,
      position: data.position,
    },
  });
}

export async function deleteProductImage(imageId: string) {
  return prisma.productImage.delete({ where: { id: imageId } });
}

export async function findProductImage(imageId: string, productId: string) {
  return prisma.productImage.findFirst({
    where: { id: imageId, productId },
  });
}

// ─── VARIANT operations ────────────────────────────────────────

export async function deleteVariantsByProductId(productId: string) {
  return prisma.variant.deleteMany({ where: { productId } });
}

export async function upsertVariant(data: {
  id?: string;
  productId: string;
  size: Variant["size"];
  color: string;
  sku: string;
  stock: number;
  priceDelta: Prisma.Decimal;
}) {
  if (data.id) {
    return prisma.variant.update({
      where: { id: data.id },
      data: {
        size: data.size,
        color: data.color,
        sku: data.sku,
        stock: data.stock,
        priceDelta: data.priceDelta,
      },
    });
  }
  return prisma.variant.create({
    data: {
      productId: data.productId,
      size: data.size,
      color: data.color,
      sku: data.sku,
      stock: data.stock,
      priceDelta: data.priceDelta,
    },
  });
}
