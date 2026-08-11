import { PrismaClient, Prisma } from "@prisma/client";

export type CartWithItems = Prisma.CartGetPayload<{
  include: {
    items: {
      include: {
        variant: {
          include: {
            product: {
              include: {
                images: { orderBy: { position: "asc" }; take: 1 };
              };
            };
          };
        };
      };
    };
  };
}>;

export interface VariantForCart {
  id: string;
  isActive: boolean;
  stock: number;
}

export interface CartItemWithVariant {
  id: string;
  cartId: string;
  variantId: string;
  quantity: number;
  variant: VariantForCart;
}

export interface CartRepository {
  findOrCreateByUserId(userId: string, tx?: Prisma.TransactionClient): Promise<CartWithItems>;
  findVariantById(variantId: string): Promise<VariantForCart | null>;
  findItemById(itemId: string): Promise<CartItemWithVariant | null>;
  upsertItem(
    cartId: string,
    variantId: string,
    quantity: number,
  ): Promise<void>;
  updateItemQuantity(itemId: string, quantity: number): Promise<void>;
  removeItem(itemId: string): Promise<void>;
  clearCart(cartId: string, tx?: Prisma.TransactionClient): Promise<void>;
}

const includeCartItems = {
  items: {
    include: {
      variant: {
        include: {
          product: {
            include: {
              images: { orderBy: { position: "asc" as const }, take: 1 },
            },
          },
        },
      },
    },
  },
} satisfies Prisma.CartInclude;

export class PrismaCartRepository implements CartRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findOrCreateByUserId(userId: string, tx?: Prisma.TransactionClient): Promise<CartWithItems> {
    const client = tx ?? this.prisma;
    return client.cart.upsert({
      where: { userId },
      update: {},
      create: { userId },
      include: includeCartItems,
    });
  }

  async findVariantById(variantId: string): Promise<VariantForCart | null> {
    return this.prisma.variant.findUnique({
      where: { id: variantId },
      select: { id: true, isActive: true, stock: true },
    });
  }

  async findItemById(itemId: string): Promise<CartItemWithVariant | null> {
    return this.prisma.cartItem.findUnique({
      where: { id: itemId },
      select: {
        id: true,
        cartId: true,
        variantId: true,
        quantity: true,
        variant: { select: { id: true, isActive: true, stock: true } },
      },
    });
  }

  async upsertItem(cartId: string, variantId: string, quantity: number) {
    await this.prisma.cartItem.upsert({
      where: { cartId_variantId: { cartId, variantId } },
      update: { quantity: { increment: quantity } },
      create: { cartId, variantId, quantity },
    });
  }

  async updateItemQuantity(itemId: string, quantity: number) {
    await this.prisma.cartItem.update({
      where: { id: itemId },
      data: { quantity },
    });
  }

  async removeItem(itemId: string) {
    await this.prisma.cartItem.delete({ where: { id: itemId } });
  }

  async clearCart(cartId: string, tx?: Prisma.TransactionClient) {
    const client = tx ?? this.prisma;
    await client.cartItem.deleteMany({ where: { cartId } });
  }
}
