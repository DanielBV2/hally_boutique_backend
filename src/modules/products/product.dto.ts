export interface ProductListItemDTO {
  id: string;
  name: string;
  slug: string;
  basePrice: number;
  currency: string;
  thumbnailUrl: string | null;
  secondaryImageUrl: string | null;
  categoryName: string;
  images: { id: string; url: string; altText: string | null }[];
  hasStock: boolean;
}

export interface ProductDetailDTO {
  id: string;
  name: string;
  slug: string;
  description: string;
  basePrice: number;
  currency: string;
  category: { id: string; name: string; slug: string };
  images: { id: string; url: string; altText: string | null }[];
  variants: {
    id: string;
    size: string;
    color: string;
    stock: number;
    price: number;
    inStock: boolean;
  }[];
}
