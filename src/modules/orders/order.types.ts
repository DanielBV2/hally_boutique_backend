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
  weightGrams: number;
}

export interface CreateOrderData {
  userId: string;
  subtotal: number;
  taxAmount: number;
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

export type AdminOrderWithUser = Prisma.OrderGetPayload<{
  include: {
    items: true;
    user: {
      select: {
        email: true;
        firstName: true;
        lastName: true;
      };
    };
  };
}>;
