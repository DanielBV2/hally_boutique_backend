import { z } from "zod";

export const createProductSchema = z.object({
  name: z.string().min(3).max(200),
  description: z.string().min(10).max(5000),
  basePrice: z.number().positive(),
  currency: z.string().default("COP"),
  weightGrams: z.number().int().positive().default(300),
  categoryId: z.string().uuid(),
});

export type CreateProductInput = z.infer<typeof createProductSchema>;

export const updateProductSchema = createProductSchema.partial().extend({
  weightGrams: z.number().int().positive().optional(),
});

export type UpdateProductInput = z.infer<typeof updateProductSchema>;

export const listProductsQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(50).default(20),
  categoryId: z.string().uuid().optional(),
  search: z.string().optional(),
  minPrice: z.coerce.number().positive().optional(),
  maxPrice: z.coerce.number().positive().optional(),
  sortBy: z.enum(["createdAt", "basePrice", "name"]).default("createdAt"),
  sortOrder: z.enum(["asc", "desc"]).default("desc"),
});

export type ListProductsQuery = z.infer<typeof listProductsQuerySchema>;

export const adminProductsQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(50).default(20),
  isActive: z.coerce.boolean().optional(),
  categoryId: z.string().uuid().optional(),
  search: z.string().optional(),
});

export type AdminProductsQuery = z.infer<typeof adminProductsQuerySchema>;

export const addProductImageSchema = z.object({
  url: z.string().url(),
  altText: z.string().max(200).optional(),
  position: z.number().int().min(0).default(0),
});

export type AddProductImageInput = z.infer<typeof addProductImageSchema>;

export const idParamsSchema = z.object({
  id: z.string().uuid(),
});

export const slugParamsSchema = z.object({
  slug: z.string().min(1),
});

export const imageParamsSchema = z.object({
  id: z.string().uuid(),
  imageId: z.string().uuid(),
});
