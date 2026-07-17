import { z } from "zod";

export const createCategorySchema = z.object({
  name: z.string().min(2).max(100),
  description: z.string().max(1000).optional(),
});

export type CreateCategoryInput = z.infer<typeof createCategorySchema>;

export const updateCategorySchema = createCategorySchema.partial();

export type UpdateCategoryInput = z.infer<typeof updateCategorySchema>;

export const categoryIdParamsSchema = z.object({
  id: z.string().uuid(),
});

export const categorySlugParamsSchema = z.object({
  slug: z.string().min(1),
});
