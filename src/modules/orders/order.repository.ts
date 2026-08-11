import { PrismaClient, Prisma } from "@prisma/client";
import type { CreateOrderData, OrderWithItems, Pagination, AdminOrderWithUser } from "./order.types.js";
import type { OrderStatus } from "@prisma/client";

export interface OrderFilters {
  status?: OrderStatus;
}

export interface OrderRepository {
  findByIdempotencyKey(userId: string, key: string): Promise<OrderWithItems | null>;
  findManyByUser(
    userId: string,
    pagination: Pagination,
  ): Promise<{ orders: OrderWithItems[]; total: number }>;
  findAllAdmin(
    filters: OrderFilters,
    pagination: Pagination,
  ): Promise<{ orders: AdminOrderWithUser[]; total: number }>;
  findByIdWithItems(id: string): Promise<OrderWithItems | null>;
  findByIdAdmin(id: string): Promise<AdminOrderWithUser | null>;
  createWithItems(data: CreateOrderData): Promise<OrderWithItems>;
  updateStatus(orderId: string, status: OrderStatus, tx?: Prisma.TransactionClient): Promise<void>;
  /**
   * Transición atómica PENDING → PAID (compare-and-swap). Solo la transacción
   * que logre el UPDATE condicional devuelve true; las concurrentes reciben
   * false y no deben descontar stock ni marcar el pago como SUCCEEDED.
   * Evita el doble descuento cuando Wompi entrega webhooks duplicados.
   */
  tryTransitionToPaid(orderId: string, tx?: Prisma.TransactionClient): Promise<boolean>;
  updateShippingLabel(
    orderId: string,
    data: {
      shippingTrackingNumber: string;
      shippingLabelUrl: string;
    },
  ): Promise<void>;
  markShippingLabelFailed(orderId: string): Promise<void>;
  updateShippingAndTotal(
    orderId: string,
    data: {
      shippingCarrier: string;
      shippingService: string;
      shippingAmount: number;
      total: number;
    },
  ): Promise<OrderWithItems>;
}

const includeItems = {
  items: true,
} satisfies Prisma.OrderInclude;

const includeItemsWithUser = {
  items: true,
  user: {
    select: {
      email: true,
      firstName: true,
      lastName: true,
    },
  },
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

  async findAllAdmin(filters: OrderFilters, pagination: Pagination) {
    const { page, limit } = pagination;
    const skip = (page - 1) * limit;
    const where = filters.status ? { status: filters.status } : {};

    const [orders, total] = await Promise.all([
      this.prisma.order.findMany({
        where,
        include: includeItemsWithUser,
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
      }),
      this.prisma.order.count({ where }),
    ]);

    return { orders, total };
  }

  async findByIdWithItems(id: string) {
    return this.prisma.order.findUnique({
      where: { id },
      include: includeItems,
    });
  }

  async findByIdAdmin(id: string) {
    return this.prisma.order.findUnique({
      where: { id },
      include: includeItemsWithUser,
    });
  }

  async createWithItems(data: CreateOrderData) {
    return this.prisma.$transaction(async (tx) => {
      return tx.order.create({
        data: {
          userId: data.userId,
          subtotal: data.subtotal,
          taxAmount: data.taxAmount,
          shippingAmount: 0,
          total: data.total,
          shippingAddressId: data.shippingAddressId,
          shippingFullName: data.shippingFullName,
          shippingPhone: data.shippingPhone,
          shippingLine1: data.shippingLine1,
          shippingLine2: data.shippingLine2,
          shippingCity: data.shippingCity,
          shippingState: data.shippingState,
          shippingCountry: data.shippingCountry,
          shippingPostalCode: data.shippingPostalCode,
          idempotencyKey: data.idempotencyKey,
          items: {
            create: data.items.map((item) => ({
              variant: { connect: { id: item.variantId } },
              productName: item.productName,
              size: item.size,
              color: item.color,
              unitPrice: item.unitPrice,
              quantity: item.quantity,
              weightGrams: item.weightGrams,
            })),
          },
        },
        include: includeItems,
      });
    });
  }

  async updateStatus(orderId: string, status: OrderStatus, tx?: Prisma.TransactionClient) {
    const client = tx ?? this.prisma;
    await client.order.update({
      where: { id: orderId },
      data: { status },
    });
  }

  async tryTransitionToPaid(orderId: string, tx?: Prisma.TransactionClient): Promise<boolean> {
    const client = tx ?? this.prisma;
    const { count } = await client.order.updateMany({
      where: { id: orderId, status: "PENDING" },
      data: { status: "PAID" },
    });
    return count > 0;
  }

  async updateShippingLabel(
    orderId: string,
    data: {
      shippingTrackingNumber: string;
      shippingLabelUrl: string;
    },
  ) {
    await this.prisma.order.update({
      where: { id: orderId },
      data: {
        shippingTrackingNumber: data.shippingTrackingNumber,
        shippingLabelUrl: data.shippingLabelUrl,
        shippingStatus: "LABEL_GENERATED",
      },
    });
  }

  async markShippingLabelFailed(orderId: string) {
    await this.prisma.order.update({
      where: { id: orderId },
      data: {
        shippingStatus: "LABEL_FAILED",
      },
    });
  }

  async updateShippingAndTotal(
    orderId: string,
    data: {
      shippingCarrier: string;
      shippingService: string;
      shippingAmount: number;
      total: number;
    },
  ) {
    return this.prisma.order.update({
      where: { id: orderId },
      data: {
        shippingCarrier: data.shippingCarrier,
        shippingService: data.shippingService,
        shippingAmount: data.shippingAmount,
        total: data.total,
      },
      include: includeItems,
    });
  }
}
