import { type PrismaClient } from "@prisma/client";
import type { Address } from "@prisma/client";
import type { CreateAddressData } from "./address.types.js";

export interface AddressRepository {
  findAllByUser(userId: string): Promise<Address[]>;
  findById(id: string): Promise<Address | null>;
  create(userId: string, data: CreateAddressData): Promise<Address>;
  update(id: string, data: Partial<CreateAddressData>): Promise<Address>;
  unsetDefaultForUser(userId: string, excludeId?: string): Promise<void>;
  delete(id: string): Promise<void>;
}

export class PrismaAddressRepository implements AddressRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findAllByUser(userId: string) {
    return this.prisma.address.findMany({
      where: { userId },
      orderBy: [{ isDefault: "desc" }, { createdAt: "desc" }],
    });
  }

  async findById(id: string) {
    return this.prisma.address.findUnique({ where: { id } });
  }

  async create(userId: string, data: CreateAddressData) {
    return this.prisma.address.create({
      data: {
        userId,
        fullName: data.fullName,
        phone: data.phone,
        line1: data.line1,
        line2: data.line2 ?? null,
        city: data.city,
        state: data.state,
        country: data.country,
        postalCode: data.postalCode ?? null,
        isDefault: data.isDefault,
      },
    });
  }

  async update(id: string, data: Partial<CreateAddressData>) {
    return this.prisma.address.update({
      where: { id },
      data: {
        ...(data.fullName !== undefined && { fullName: data.fullName }),
        ...(data.phone !== undefined && { phone: data.phone }),
        ...(data.line1 !== undefined && { line1: data.line1 }),
        ...(data.line2 !== undefined && { line2: data.line2 ?? null }),
        ...(data.city !== undefined && { city: data.city }),
        ...(data.state !== undefined && { state: data.state }),
        ...(data.country !== undefined && { country: data.country }),
        ...(data.postalCode !== undefined && { postalCode: data.postalCode ?? null }),
        ...(data.isDefault !== undefined && { isDefault: data.isDefault }),
      },
    });
  }

  async unsetDefaultForUser(userId: string, excludeId?: string) {
    const where = excludeId ? { userId, id: { not: excludeId } } : { userId };

    await this.prisma.address.updateMany({
      where: { ...where, isDefault: true },
      data: { isDefault: false },
    });
  }

  async delete(id: string) {
    await this.prisma.address.delete({ where: { id } });
  }
}
