export interface CartItemDTO {
  id: string;
  variantId: string;
  productName: string;
  productSlug: string;
  size: string;
  color: string;
  thumbnailUrl: string | null;
  unitPrice: number;
  quantity: number;
  subtotal: number;
  availableStock: number;
  isAvailable: boolean;
}

export interface CartDTO {
  id: string;
  items: CartItemDTO[];
  totalItems: number;
  subtotal: number;
}
