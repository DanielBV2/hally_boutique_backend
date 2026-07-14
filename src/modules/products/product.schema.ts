import { z } from "zod";
import { Size } from "@prisma/client";

// ─── Variant sub-schema ────────────────────────────────────────

const variantSchema = z.object({
  size: z.nativeEnum(Size),
  color: z.string().min(1).max(50),
  sku: z.string().min(1).max(50),
  stock: z.number().int().min(0),
  priceDelta: z.number().min(0).default(0),
});

// ─── Image sub-schema (used inside createProduct) ──────────────

const productImageSchema = z.object({
  url: z.string().url(),
  altText: z.string().max(255).optional(),
  position: z.number().int().min(0).default(0),
});

// ─── CREATE ────────────────────────────────────────────────────

export const createProductSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().min(1),
  basePrice: z.number().positive(),
  currency: z.string().length(3).default("COP"),
  categoryId: z.string().uuid(),
  variants: z.array(variantSchema).min(1),
  images: z.array(productImageSchema).optional(),
});

export type CreateProductInput = z.infer<typeof createProductSchema>;

// ─── UPDATE (all fields optional) ──────────────────────────────

const updateVariantSchema = z.object({
  id: z.string().uuid().optional(), // existing variant → update; omit → create new
  size: z.nativeEnum(Size).optional(),
  color: z.string().min(1).max(50).optional(),
  sku: z.string().min(1).max(50).optional(),
  stock: z.number().int().min(0).optional(),
  priceDelta: z.number().min(0).optional(),
});

export const updateProductSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().min(1).optional(),
  basePrice: z.number().positive().optional(),
  currency: z.string().length(3).optional(),
  categoryId: z.string().uuid().optional(),
  variants: z.array(updateVariantSchema).optional(),
});

export type UpdateProductInput = z.infer<typeof updateProductSchema>;

// ─── LIST query ────────────────────────────────────────────────

export const listProductsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().optional(),
  categoryId: z.string().uuid().optional(),
  sortBy: z.enum(["name", "basePrice", "createdAt"]).default("createdAt"),
  sortOrder: z.enum(["asc", "desc"]).default("desc"),
});

export type ListProductsQuery = z.infer<typeof listProductsQuerySchema>;

// ─── ADD IMAGE ─────────────────────────────────────────────────

export const addProductImageSchema = z.object({
  url: z.string().url(),
  altText: z.string().max(255).optional(),
  position: z.number().int().min(0).default(0),
});

export type AddProductImageInput = z.infer<typeof addProductImageSchema>;

// ─── PARAMS ────────────────────────────────────────────────────

export const productByIdParamsSchema = z.object({
  id: z.string().uuid(),
});

export const productBySlugParamsSchema = z.object({
  slug: z.string().min(1),
});

export const productImageParamsSchema = z.object({
  id: z.string().uuid(),
  imageId: z.string().uuid(),
});
