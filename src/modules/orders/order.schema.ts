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

export const idParamsSchema = z.object({
  id: z.string().uuid(),
});

export const orderIdParamsSchema = z.object({
  orderId: z.string().uuid(),
});

export const shippingSelectionSchema = z.object({
  carrier: z.string().min(1),
  service: z.string().min(1),
});

export type ShippingSelectionInput = z.infer<typeof shippingSelectionSchema>;

export const updateOrderAddressSchema = z.object({
  addressId: z.string().uuid(),
});

export type UpdateOrderAddressInput = z.infer<typeof updateOrderAddressSchema>;

export const adminOrdersQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(50).default(20),
  status: z
    .enum(["PENDING", "PAID", "PROCESSING", "SHIPPED", "DELIVERED", "CANCELLED", "REFUNDED"])
    .optional(),
  search: z.string().optional(),
});

export type AdminOrdersQuery = z.infer<typeof adminOrdersQuerySchema>;

export const updateOrderStatusSchema = z.object({
  status: z.enum(["PROCESSING", "SHIPPED", "DELIVERED"]), // solo estos 3 son manuales
});

export type UpdateOrderStatusInput = z.infer<typeof updateOrderStatusSchema>;
