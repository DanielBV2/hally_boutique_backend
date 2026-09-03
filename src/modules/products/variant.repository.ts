import { type PrismaClient } from "@prisma/client";
import type { Prisma, Size } from "@prisma/client";

export interface CreateVariantData {
  size: Size;
  color: string;
  sku: string;
  stock: number;
  priceDelta: number;
}

export interface UpdateVariantData {
  stock?: number | undefined;
  priceDelta?: number | undefined;
  sku?: string | undefined;
  isActive?: boolean | undefined;
  deactivatedAt?: Date | null | undefined;
  deactivatedById?: string | null | undefined;
}

export interface VariantRepository {
  findAllByProduct(productId: string): Promise<Prisma.VariantGetPayload<Record<string, never>>[]>;
  findById(id: string): Promise<Prisma.VariantGetPayload<Record<string, never>> | null>;
  existsCombination(
    productId: string,
    size: string,
    color: string,
    excludeId?: string,
  ): Promise<boolean>;
  skuExists(sku: string, excludeId?: string): Promise<boolean>;
  create(
    productId: string,
    data: CreateVariantData,
  ): Promise<Prisma.VariantGetPayload<Record<string, never>>>;
  update(
    id: string,
    data: UpdateVariantData,
  ): Promise<Prisma.VariantGetPayload<Record<string, never>>>;
  softDelete(id: string, deactivatedById: string): Promise<void>;
  decrementStockIfAvailable(
    variantId: string,
    quantity: number,
    tx: Prisma.TransactionClient,
  ): Promise<boolean>;
}

export class PrismaVariantRepository implements VariantRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findAllByProduct(productId: string) {
    return this.prisma.variant.findMany({
      where: { productId },
      orderBy: [{ size: "asc" }, { color: "asc" }],
    });
  }

  async findById(id: string) {
    return this.prisma.variant.findUnique({ where: { id } });
  }

  async existsCombination(productId: string, size: string, color: string, excludeId?: string) {
    const where: Prisma.VariantWhereInput = {
      productId,
      size: size as Size,
      color,
    };

    if (excludeId) {
      where.id = { not: excludeId };
    }

    const variant = await this.prisma.variant.findFirst({
      where,
      select: { id: true },
    });

    return variant !== null;
  }

  async skuExists(sku: string, excludeId?: string) {
    const where: Prisma.VariantWhereInput = { sku };

    if (excludeId) {
      where.id = { not: excludeId };
    }

    const variant = await this.prisma.variant.findFirst({
      where,
      select: { id: true },
    });

    return variant !== null;
  }

  async create(productId: string, data: CreateVariantData) {
    return this.prisma.variant.create({
      data: { ...data, productId },
    });
  }

  async update(id: string, data: UpdateVariantData) {
    const updateData: Prisma.VariantUncheckedUpdateInput = {};
    if (data.stock !== undefined) updateData.stock = data.stock;
    if (data.priceDelta !== undefined) updateData.priceDelta = data.priceDelta;
    if (data.sku !== undefined) updateData.sku = data.sku;
    if (data.isActive !== undefined) updateData.isActive = data.isActive;
    if (data.deactivatedAt !== undefined) updateData.deactivatedAt = data.deactivatedAt;
    if (data.deactivatedById !== undefined) updateData.deactivatedById = data.deactivatedById;

    return this.prisma.variant.update({
      where: { id },
      data: updateData,
    });
  }

  async softDelete(id: string, deactivatedById: string) {
    await this.prisma.variant.update({
      where: { id },
      data: { isActive: false, deactivatedAt: new Date(), deactivatedById },
    });
  }

  async decrementStockIfAvailable(
    variantId: string,
    quantity: number,
    tx: Prisma.TransactionClient,
  ) {
    const { count } = await tx.variant.updateMany({
      where: { id: variantId, stock: { gte: quantity } },
      data: { stock: { decrement: quantity } },
    });
    return count > 0;
  }
}
