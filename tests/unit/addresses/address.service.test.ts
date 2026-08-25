import { describe, it, expect, vi, beforeEach } from "vitest";

const { MockPrismaClientKnownRequestError } = vi.hoisted(() => {
  class MockPrismaClientKnownRequestError extends Error {
    public code: string;
    constructor(message: string, code: string) {
      super(message);
      this.name = "PrismaClientKnownRequestError";
      this.code = code;
    }
  }
  return { MockPrismaClientKnownRequestError };
});

vi.mock("../../../src/config/env.js", () => ({
  env: {
    JWT_SECRET: "test-secret",
    JWT_EXPIRES_IN: "7d",
    DATABASE_URL: "postgresql://test",
    WOMPI_PUBLIC_KEY: "pub_test",
    WOMPI_PRIVATE_KEY: "prv_test",
    WOMPI_INTEGRITY_SECRET: "int_test",
    WOMPI_EVENTS_SECRET: "evt_test",
    WOMPI_REDIRECT_URL: "https://example.com",
    WOMPI_API_BASE_URL: "https://sandbox.wompi.co/v1",
  },
}));

vi.mock("@prisma/client", () => ({
  Prisma: {
    PrismaClientKnownRequestError: MockPrismaClientKnownRequestError,
  },
}));

import { AddressServiceImpl } from "../../../src/modules/addresses/address.service.js";
import type { AddressRepository } from "../../../src/modules/addresses/address.repository.js";
import type { Address } from "@prisma/client";
import { NotFoundError, ConflictError } from "../../../src/shared/errors/app-error.js";

function mockAddressRepo(): AddressRepository {
  return {
    findAllByUser: vi.fn(),
    findById: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    unsetDefaultForUser: vi.fn(),
    delete: vi.fn(),
  };
}

function makeAddress(overrides: Partial<Address> = {}): Address {
  return {
    id: "addr-1",
    userId: "user-1",
    fullName: "Juan Pérez",
    phone: "3001234567",
    line1: "Calle 123",
    line2: null,
    city: "Medellín",
    state: "Antioquia",
    country: "CO",
    postalCode: "050001",
    isDefault: false,
    createdAt: new Date("2026-01-01"),
    updatedAt: new Date("2026-01-01"),
    ...overrides,
  };
}

const baseInput = {
  fullName: "Juan Pérez",
  phone: "3001234567",
  line1: "Calle 123",
  city: "Medellín",
  state: "Antioquia",
  country: "CO",
  postalCode: "050001",
};

describe("AddressServiceImpl", () => {
  let addressRepo: ReturnType<typeof mockAddressRepo>;
  let service: AddressServiceImpl;

  beforeEach(() => {
    vi.clearAllMocks();
    addressRepo = mockAddressRepo();
    service = new AddressServiceImpl(addressRepo);
  });

  describe("createAddress", () => {
    it("llama a unsetDefaultForUser ANTES de crear cuando isDefault es true", async () => {
      const callOrder: string[] = [];
      vi.mocked(addressRepo.unsetDefaultForUser).mockImplementation(async () => {
        callOrder.push("unset");
      });
      vi.mocked(addressRepo.create).mockImplementation(async () => {
        callOrder.push("create");
        return makeAddress({ isDefault: true });
      });

      await service.createAddress("user-1", { ...baseInput, isDefault: true });

      expect(callOrder).toEqual(["unset", "create"]);
      expect(addressRepo.unsetDefaultForUser).toHaveBeenCalledWith("user-1");
    });

    it("NO llama a unsetDefaultForUser cuando isDefault es false", async () => {
      vi.mocked(addressRepo.create).mockResolvedValue(makeAddress());

      await service.createAddress("user-1", { ...baseInput, isDefault: false });

      expect(addressRepo.unsetDefaultForUser).not.toHaveBeenCalled();
    });
  });

  describe("updateAddress", () => {
    it("lanza NotFoundError si la dirección no pertenece al usuario", async () => {
      vi.mocked(addressRepo.findById).mockResolvedValue(makeAddress({ userId: "other-user" }));

      await expect(service.updateAddress("user-1", "addr-1", { isDefault: true })).rejects.toThrow(
        NotFoundError,
      );
      expect(addressRepo.update).not.toHaveBeenCalled();
    });

    it("llama a unsetDefaultForUser cuando se cambia isDefault a true", async () => {
      vi.mocked(addressRepo.findById).mockResolvedValue(makeAddress());
      vi.mocked(addressRepo.update).mockResolvedValue(makeAddress({ isDefault: true }));

      await service.updateAddress("user-1", "addr-1", { isDefault: true });

      expect(addressRepo.unsetDefaultForUser).toHaveBeenCalledWith("user-1", "addr-1");
    });
  });

  describe("deleteAddress", () => {
    it("lanza NotFoundError si la dirección no pertenece al usuario", async () => {
      vi.mocked(addressRepo.findById).mockResolvedValue(makeAddress({ userId: "other-user" }));

      await expect(service.deleteAddress("user-1", "addr-1")).rejects.toThrow(NotFoundError);
      expect(addressRepo.delete).not.toHaveBeenCalled();
    });

    it("lanza ConflictError cuando Prisma lanza P2003 (FK violation)", async () => {
      vi.mocked(addressRepo.findById).mockResolvedValue(makeAddress());
      const fkError = new MockPrismaClientKnownRequestError(
        "Foreign key constraint failed",
        "P2003",
      );
      vi.mocked(addressRepo.delete).mockRejectedValue(fkError);

      const error = await service.deleteAddress("user-1", "addr-1").catch((e) => e);

      expect(error).toBeInstanceOf(ConflictError);
      expect(error.message).toContain("órdenes asociadas");
    });

    it("elimina exitosamente cuando no hay error de FK", async () => {
      vi.mocked(addressRepo.findById).mockResolvedValue(makeAddress());
      vi.mocked(addressRepo.delete).mockResolvedValue(undefined);

      await service.deleteAddress("user-1", "addr-1");

      expect(addressRepo.delete).toHaveBeenCalledWith("addr-1");
    });
  });
});
