import { z } from "zod";

export const createVariantSchema = z.object({
  size: z.enum(["XS", "S", "M", "L", "XL", "XXL"]),
  color: z.string().min(2).max(50),
  sku: z.string().min(3).max(50),
  stock: z.number().int().nonnegative().default(0),
  priceDelta: z.number().default(0),
});

export type CreateVariantInput = z.infer<typeof createVariantSchema>;

export const updateVariantSchema = z.object({
  stock: z.number().int().nonnegative().optional(),
  priceDelta: z.number().optional(),
  sku: z.string().min(3).max(50).optional(),
  isActive: z.boolean().optional(),
});

export type UpdateVariantInput = z.infer<typeof updateVariantSchema>;

export const productIdParamsSchema = z.object({
  productId: z.string().uuid(),
});

export const variantParamsSchema = z.object({
  productId: z.string().uuid(),
  variantId: z.string().uuid(),
});
