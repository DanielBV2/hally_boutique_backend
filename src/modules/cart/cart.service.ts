import type { CartRepository, CartWithItems } from "./cart.repository.js";
import type { CartDTO, CartItemDTO } from "./cart.dto.js";
import type { AddCartItemInput, UpdateCartItemInput } from "./cart.schema.js";
import { NotFoundError, ConflictError } from "../../shared/errors/app-error.js";

export interface CartService {
  getCart(userId: string): Promise<CartDTO>;
  addItem(userId: string, data: AddCartItemInput): Promise<CartDTO>;
  updateItemQuantity(userId: string, itemId: string, data: UpdateCartItemInput): Promise<CartDTO>;
  removeItem(userId: string, itemId: string): Promise<CartDTO>;
  clearCart(userId: string): Promise<void>;
}

function toCartItemDTO(item: CartWithItems["items"][number]): CartItemDTO {
  const variant = item.variant;
  const product = variant.product;
  const unitPrice = Number(product.basePrice) + Number(variant.priceDelta);
  const thumbnailUrl = product.images[0]?.url ?? null;
  const isAvailable = variant.isActive && variant.stock > 0;

  return {
    id: item.id,
    variantId: variant.id,
    productName: product.name,
    productSlug: product.slug,
    size: variant.size,
    color: variant.color,
    thumbnailUrl,
    unitPrice,
    quantity: item.quantity,
    subtotal: unitPrice * item.quantity,
    availableStock: variant.stock,
    isAvailable,
  };
}

function toCartDTO(cart: CartWithItems): CartDTO {
  const items = cart.items.map(toCartItemDTO);

  return {
    id: cart.id,
    items,
    totalItems: items.reduce((sum, i) => sum + i.quantity, 0),
    subtotal: items.reduce((sum, i) => sum + i.subtotal, 0),
  };
}

export class CartServiceImpl implements CartService {
  constructor(private readonly repository: CartRepository) {}

  async getCart(userId: string): Promise<CartDTO> {
    const cart = await this.repository.findOrCreateByUserId(userId);
    return toCartDTO(cart);
  }

  async addItem(userId: string, data: AddCartItemInput): Promise<CartDTO> {
    const variant = await this.repository.findVariantById(data.variantId);

    if (!variant) {
      throw new NotFoundError("Variant");
    }
    if (!variant.isActive) {
      throw new ConflictError("Esta variante no está disponible");
    }

    const cart = await this.repository.findOrCreateByUserId(userId);

    const existingItem = cart.items.find((i) => i.variantId === data.variantId);
    const currentQuantity = existingItem?.quantity ?? 0;
    const requestedTotal = currentQuantity + data.quantity;

    if (requestedTotal > variant.stock) {
      throw new ConflictError(
        `Stock insuficiente. Disponible: ${variant.stock}, en carrito: ${currentQuantity}, solicitado: ${data.quantity}`,
      );
    }

    await this.repository.upsertItem(cart.id, data.variantId, data.quantity);

    const updatedCart = await this.repository.findOrCreateByUserId(userId);
    return toCartDTO(updatedCart);
  }

  async updateItemQuantity(
    userId: string,
    itemId: string,
    data: UpdateCartItemInput,
  ): Promise<CartDTO> {
    const cart = await this.repository.findOrCreateByUserId(userId);

    const cartItem = await this.repository.findItemById(itemId);
    if (cartItem?.cartId !== cart.id) {
      throw new NotFoundError("CartItem");
    }

    if (data.quantity > cartItem.variant.stock) {
      throw new ConflictError(`Stock insuficiente. Disponible: ${cartItem.variant.stock}`);
    }

    await this.repository.updateItemQuantity(itemId, data.quantity);

    const updatedCart = await this.repository.findOrCreateByUserId(userId);
    return toCartDTO(updatedCart);
  }

  async removeItem(userId: string, itemId: string): Promise<CartDTO> {
    const cart = await this.repository.findOrCreateByUserId(userId);

    const cartItem = await this.repository.findItemById(itemId);
    if (cartItem?.cartId !== cart.id) {
      throw new NotFoundError("CartItem");
    }

    await this.repository.removeItem(itemId);

    const updatedCart = await this.repository.findOrCreateByUserId(userId);
    return toCartDTO(updatedCart);
  }

  async clearCart(userId: string): Promise<void> {
    const cart = await this.repository.findOrCreateByUserId(userId);
    await this.repository.clearCart(cart.id);
  }
}
