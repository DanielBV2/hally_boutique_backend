export interface OrderItemDTO {
  id: string;
  productName: string;
  size: string;
  color: string;
  unitPrice: number;
  quantity: number;
  lineTotal: number;
}

export interface OrderListItemDTO {
  id: string;
  status: string;
  total: number;
  currency: string;
  itemsCount: number;
  createdAt: Date;
}

export interface OrderDetailDTO {
  id: string;
  status: string;
  subtotal: number;
  taxAmount: number;
  shippingAmount: number;
  total: number;
  currency: string;
  items: OrderItemDTO[];
  shippingAddressId: string;
  createdAt: Date;
}
