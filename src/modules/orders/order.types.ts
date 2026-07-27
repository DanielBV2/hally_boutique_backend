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
  shippingFullName: string;
  shippingPhone: string;
  shippingLine1: string;
  shippingLine2: string | null;
  shippingCity: string;
  shippingState: string;
  shippingCountry: string;
  shippingPostalCode: string | null;
  items: CreateOrderItemData[];
}

export type OrderWithItems = Prisma.OrderGetPayload<{
  include: {
    items: true;
  };
}>;
