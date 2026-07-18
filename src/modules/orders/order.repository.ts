import { PrismaClient, Prisma } from "@prisma/client";
import type { CreateOrderData, OrderWithItems, Pagination } from "./order.types.js";

export interface OrderRepository {
  findByIdempotencyKey(userId: string, key: string): Promise<OrderWithItems | null>;
  findManyByUser(
    userId: string,
    pagination: Pagination,
  ): Promise<{ orders: OrderWithItems[]; total: number }>;
  findByIdWithItems(id: string): Promise<OrderWithItems | null>;
  createWithItems(data: CreateOrderData): Promise<OrderWithItems>;
}

const includeItems = {
  items: true,
} satisfies Prisma.OrderInclude;

export class PrismaOrderRepository implements OrderRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findByIdempotencyKey(userId: string, key: string) {
    return this.prisma.order.findFirst({
      where: { userId, idempotencyKey: key },
      include: includeItems,
    });
  }

  async findManyByUser(userId: string, pagination: Pagination) {
    const { page, limit } = pagination;
    const skip = (page - 1) * limit;

    const [orders, total] = await Promise.all([
      this.prisma.order.findMany({
        where: { userId },
        include: includeItems,
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
      }),
      this.prisma.order.count({ where: { userId } }),
    ]);

    return { orders, total };
  }

  async findByIdWithItems(id: string) {
    return this.prisma.order.findUnique({
      where: { id },
      include: includeItems,
    });
  }

  async createWithItems(data: CreateOrderData) {
    return this.prisma.$transaction(async (tx) => {
      return tx.order.create({
        data: {
          userId: data.userId,
          subtotal: data.subtotal,
          taxAmount: 0,
          shippingAmount: 0,
          total: data.total,
          shippingAddressId: data.shippingAddressId,
          idempotencyKey: data.idempotencyKey,
          items: {
            create: data.items.map((item) => ({
              variant: { connect: { id: item.variantId } },
              productName: item.productName,
              size: item.size,
              color: item.color,
              unitPrice: item.unitPrice,
              quantity: item.quantity,
            })),
          },
        },
        include: includeItems,
      });
    });
  }
}
