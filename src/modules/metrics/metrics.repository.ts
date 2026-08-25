import type { PrismaClient } from "@prisma/client";

export interface LowStockVariantRow {
  id: string;
  productName: string;
  size: string;
  color: string;
  stock: number;
}

export interface MetricsRepository {
  countOrdersByStatus(): Promise<Record<string, number>>;
  sumRevenueFromPaidOrders(): Promise<number>; // suma total de órdenes con status en [PAID, PROCESSING, SHIPPED, DELIVERED]
  countCustomers(): Promise<number>; // usuarios con role CUSTOMER
  findLowStockVariants(threshold: number): Promise<LowStockVariantRow[]>; // variantes activas con stock <= threshold, incluye el nombre del producto relacionado (join con Product)
}

export class PrismaMetricsRepository implements MetricsRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async countOrdersByStatus(): Promise<Record<string, number>> {
    const grouped = await this.prisma.order.groupBy({
      by: ["status"],
      _count: { _all: true },
    });

    const result: Record<string, number> = {};
    for (const g of grouped) {
      result[g.status] = g._count._all;
    }
    return result;
  }

  async sumRevenueFromPaidOrders(): Promise<number> {
    const aggregate = await this.prisma.order.aggregate({
      where: { status: { in: ["PAID", "PROCESSING", "SHIPPED", "DELIVERED"] } },
      _sum: { total: true },
    });

    return Number(aggregate._sum.total ?? 0);
  }

  async countCustomers(): Promise<number> {
    return this.prisma.user.count({ where: { role: "CUSTOMER" } });
  }

  async findLowStockVariants(threshold: number): Promise<LowStockVariantRow[]> {
    const variants = await this.prisma.variant.findMany({
      where: { isActive: true, stock: { lte: threshold } },
      select: {
        id: true,
        size: true,
        color: true,
        stock: true,
        product: { select: { name: true } },
      },
      orderBy: { stock: "asc" },
    });

    return variants.map((variant) => ({
      id: variant.id,
      productName: variant.product.name,
      size: variant.size,
      color: variant.color,
      stock: variant.stock,
    }));
  }
}
