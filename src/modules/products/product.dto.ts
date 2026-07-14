import type { Size } from "@prisma/client";

// ─── LIST item ─────────────────────────────────────────────────

export interface ProductListItemDTO {
  id: string;
  name: string;
  slug: string;
  description: string;
  basePrice: number;
  currency: string;
  categoryName: string;
  mainImage: string | null;
  createdAt: Date;
}

// ─── DETAIL ────────────────────────────────────────────────────

export interface ProductVariantDetailDTO {
  id: string;
  size: Size;
  color: string;
  sku: string;
  stock: number;
  priceDelta: number;
  finalPrice: number;
  inStock: boolean;
}

export interface ProductImageDetailDTO {
  id: string;
  url: string;
  altText: string | null;
  position: number;
}

export interface ProductDetailDTO {
  id: string;
  name: string;
  slug: string;
  description: string;
  basePrice: number;
  currency: string;
  category: {
    id: string;
    name: string;
    slug: string;
  };
  images: ProductImageDetailDTO[];
  variants: ProductVariantDetailDTO[];
  createdAt: Date;
}
