import { Prisma } from "@prisma/client";
import type { AddressRepository } from "./address.repository.js";
import type { CreateAddressData } from "./address.types.js";
import type { AddressDTO } from "./address.dto.js";
import type { CreateAddressInput, UpdateAddressInput } from "./address.schema.js";
import { NotFoundError, ConflictError } from "../../shared/errors/app-error.js";

export interface AddressService {
  listByUser(userId: string): Promise<AddressDTO[]>;
  createAddress(userId: string, data: CreateAddressInput): Promise<AddressDTO>;
  updateAddress(userId: string, addressId: string, data: UpdateAddressInput): Promise<AddressDTO>;
  deleteAddress(userId: string, addressId: string): Promise<void>;
}

function toDTO(address: {
  id: string;
  fullName: string;
  phone: string;
  line1: string;
  line2: string | null;
  city: string;
  state: string;
  country: string;
  postalCode: string | null;
  isDefault: boolean;
}): AddressDTO {
  return {
    id: address.id,
    fullName: address.fullName,
    phone: address.phone,
    line1: address.line1,
    line2: address.line2,
    city: address.city,
    state: address.state,
    country: address.country,
    postalCode: address.postalCode,
    isDefault: address.isDefault,
  };
}

export class AddressServiceImpl implements AddressService {
  constructor(private readonly repository: AddressRepository) {}

  async listByUser(userId: string) {
    const addresses = await this.repository.findAllByUser(userId);
    return addresses.map(toDTO);
  }

  private static normalizeInput(data: CreateAddressInput): CreateAddressData {
    return {
      fullName: data.fullName,
      phone: data.phone,
      line1: data.line1,
      line2: data.line2 ?? null,
      city: data.city,
      state: data.state,
      country: data.country,
      postalCode: data.postalCode ?? null,
      isDefault: data.isDefault,
    };
  }

  async createAddress(userId: string, data: CreateAddressInput) {
    const normalized = AddressServiceImpl.normalizeInput(data);

    if (normalized.isDefault) {
      await this.repository.unsetDefaultForUser(userId);
    }

    const address = await this.repository.create(userId, normalized);
    return toDTO(address);
  }

  async updateAddress(userId: string, addressId: string, data: UpdateAddressInput) {
    const existing = await this.repository.findById(addressId);
    if (!existing || existing.userId !== userId) {
      throw new NotFoundError("Address");
    }

    const normalized: Partial<CreateAddressData> = {};
    if (data.fullName !== undefined) normalized.fullName = data.fullName;
    if (data.phone !== undefined) normalized.phone = data.phone;
    if (data.line1 !== undefined) normalized.line1 = data.line1;
    if (data.line2 !== undefined) normalized.line2 = data.line2 ?? null;
    if (data.city !== undefined) normalized.city = data.city;
    if (data.state !== undefined) normalized.state = data.state;
    if (data.country !== undefined) normalized.country = data.country;
    if (data.postalCode !== undefined) normalized.postalCode = data.postalCode ?? null;
    if (data.isDefault !== undefined) normalized.isDefault = data.isDefault;

    if (normalized.isDefault) {
      await this.repository.unsetDefaultForUser(userId, addressId);
    }

    const address = await this.repository.update(addressId, normalized);
    return toDTO(address);
  }

  async deleteAddress(userId: string, addressId: string) {
    const existing = await this.repository.findById(addressId);
    if (!existing || existing.userId !== userId) {
      throw new NotFoundError("Address");
    }

    try {
      await this.repository.delete(addressId);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2003") {
        throw new ConflictError(
          "No se puede eliminar una dirección con órdenes asociadas",
        );
      }
      throw error;
    }
  }
}
