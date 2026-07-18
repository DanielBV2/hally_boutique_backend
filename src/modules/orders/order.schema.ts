import { z } from "zod";

export const createOrderSchema = z.object({
  addressId: z.string().uuid(),
  idempotencyKey: z.string().uuid(),
});

export type CreateOrderInput = z.infer<typeof createOrderSchema>;

export const listOrdersQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(50).default(20),
});

export type ListOrdersQuery = z.infer<typeof listOrdersQuerySchema>;

export const orderIdParamsSchema = z.object({
  id: z.string().uuid(),
});
