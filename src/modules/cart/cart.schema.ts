import { z } from "zod";

export const addCartItemSchema = z.object({
  variantId: z.string().uuid(),
  quantity: z.number().int().positive().max(20),
});

export type AddCartItemInput = z.infer<typeof addCartItemSchema>;

export const updateCartItemSchema = z.object({
  quantity: z.number().int().positive().max(20),
});

export type UpdateCartItemInput = z.infer<typeof updateCartItemSchema>;

export const cartItemParamsSchema = z.object({
  itemId: z.string().uuid(),
});
