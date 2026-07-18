import type { Prisma, Size } from "@prisma/client";

export interface Pagination {
  page: number;
  limit: number;
}

export interface CreateOrderItemData {
  variantId: string;
  productName: string;
  size: Size;
  color: string;
  unitPrice: number;
  quantity: number;
}

export interface CreateOrderData {
  userId: string;
  subtotal: number;
  total: number;
  shippingAddressId: string;
  idempotencyKey: string;
  items: CreateOrderItemData[];
}

export type OrderWithItems = Prisma.OrderGetPayload<{
  include: {
    items: true;
  };
}>;
