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
  shippingFullName: string;
  shippingPhone: string;
  shippingLine1: string;
  shippingLine2: string | null;
  shippingCity: string;
  shippingState: string;
  shippingCountry: string;
  shippingPostalCode: string | null;
  shippingCarrier: string | null;
  shippingService: string | null;
  shippingTrackingNumber: string | null;
  shippingLabelUrl: string | null;
  shippingStatus: string;
  createdAt: Date;
}

export interface AdminOrderListItemDTO extends OrderListItemDTO {
  customerEmail: string;
  customerName: string;
}

export interface AdminOrderDetailDTO extends OrderDetailDTO {
  customerEmail: string;
  customerName: string;
}
