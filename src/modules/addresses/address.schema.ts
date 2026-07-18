import { z } from "zod";

export const createAddressSchema = z.object({
  fullName: z.string().min(3).max(150),
  phone: z.string().min(7).max(20),
  line1: z.string().min(5).max(200),
  line2: z.string().max(200).optional(),
  city: z.string().min(2).max(100),
  state: z.string().min(2).max(100),
  country: z.string().length(2).default("CO"),
  postalCode: z.string().max(20).optional(),
  isDefault: z.boolean().default(false),
});

export type CreateAddressInput = z.infer<typeof createAddressSchema>;

export const updateAddressSchema = createAddressSchema.partial();

export type UpdateAddressInput = z.infer<typeof updateAddressSchema>;

export const addressIdParamsSchema = z.object({
  id: z.string().uuid(),
});
