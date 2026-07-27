import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../../src/config/env.js", () => ({
  env: {
    JWT_SECRET: "test-jwt-secret",
    JWT_EXPIRES_IN: "7d",
  },
}));

vi.mock("bcrypt", () => ({
  default: {
    hash: vi.fn(),
    compare: vi.fn(),
  },
}));

import { AuthServiceImpl } from "../../../src/modules/auth/auth.service.js";
import type { AuthRepository } from "../../../src/modules/auth/auth.repository.js";
import type { User, Role } from "@prisma/client";
import { ConflictError, UnauthorizedError, NotFoundError } from "../../../src/shared/errors/app-error.js";
import bcrypt from "bcrypt";

function mockAuthRepo(): AuthRepository {
  return {
    findByEmail: vi.fn(),
    findById: vi.fn(),
    create: vi.fn(),
  };
}

function makeUser(overrides: Partial<User> = {}): User {
  return {
    id: "user-1",
    email: "test@example.com",
    passwordHash: "$2b$12$hashedpassword",
    firstName: "Juan",
    lastName: "Pérez",
    phone: "3001234567",
    role: "CUSTOMER" as Role,
    createdAt: new Date("2026-01-01"),
    updatedAt: new Date("2026-01-01"),
    ...overrides,
  };
}

describe("AuthServiceImpl", () => {
  let authRepo: ReturnType<typeof mockAuthRepo>;
  let service: AuthServiceImpl;

  beforeEach(() => {
    vi.clearAllMocks();
    authRepo = mockAuthRepo();
    service = new AuthServiceImpl(authRepo);
  });

  describe("register", () => {
    const input = {
      email: "new@example.com",
      password: "Password1",
      firstName: "María",
      lastName: "García",
    };

    it("lanza ConflictError si el email ya está registrado", async () => {
      vi.mocked(authRepo.findByEmail).mockResolvedValue(makeUser());

      await expect(service.register(input)).rejects.toThrow(ConflictError);
    });

    it("caso feliz: hashea la password ANTES de crear el usuario", async () => {
      vi.mocked(authRepo.findByEmail).mockResolvedValue(null);
      vi.mocked(bcrypt.hash).mockResolvedValue("$2b$12$hashedpassword" as never);
      vi.mocked(authRepo.create).mockResolvedValue(makeUser());

      await service.register(input);

      expect(bcrypt.hash).toHaveBeenCalledWith("Password1", 12);
      expect(authRepo.create).toHaveBeenCalledOnce();
      const createCall = vi.mocked(authRepo.create).mock.calls[0][0];
      expect(createCall.passwordHash).toBe("$2b$12$hashedpassword");
      expect(createCall.email).toBe("new@example.com");
    });

    it("register ignora role del input y siempre usa CUSTOMER", async () => {
      vi.mocked(authRepo.findByEmail).mockResolvedValue(null);
      vi.mocked(bcrypt.hash).mockResolvedValue("$2b$12$hashedpassword" as never);
      vi.mocked(authRepo.create).mockResolvedValue(makeUser({ role: "CUSTOMER" }));

      await service.register(input as any);

      const createCall = vi.mocked(authRepo.create).mock.calls[0][0];
      expect(createCall).not.toHaveProperty("role");
    });

    it("el AuthResponseDTO no contiene passwordHash", async () => {
      vi.mocked(authRepo.findByEmail).mockResolvedValue(null);
      vi.mocked(bcrypt.hash).mockResolvedValue("$2b$12$hashedpassword" as never);
      vi.mocked(authRepo.create).mockResolvedValue(makeUser());

      const result = await service.register(input);

      expect(result).not.toHaveProperty("passwordHash");
      expect(result.user).not.toHaveProperty("passwordHash");
      expect(result.user.email).toBe("test@example.com");
      expect(typeof result.token).toBe("string");
    });
  });

  describe("login", () => {
    const input = { email: "test@example.com", password: "Password1" };

    it("lanza UnauthorizedError si el email no existe", async () => {
      vi.mocked(authRepo.findByEmail).mockResolvedValue(null);

      let error1: UnauthorizedError | undefined;
      try {
        await service.login(input);
      } catch (e) {
        error1 = e as UnauthorizedError;
      }

      expect(error1).toBeInstanceOf(UnauthorizedError);
      expect(error1!.message).toBe("Credenciales inválidas");
    });

    it("lanza el MISMO UnauthorizedError si el password es incorrecto", async () => {
      vi.mocked(authRepo.findByEmail).mockResolvedValue(makeUser());
      vi.mocked(bcrypt.compare).mockResolvedValue(false as never);

      let error2: UnauthorizedError | undefined;
      try {
        await service.login(input);
      } catch (e) {
        error2 = e as UnauthorizedError;
      }

      expect(error2).toBeInstanceOf(UnauthorizedError);
      expect(error2!.message).toBe("Credenciales inválidas");
    });

    it("los mensajes de error de email inexistente e incorrecto son idénticos", async () => {
      vi.mocked(authRepo.findByEmail).mockResolvedValue(null);
      let errorMsg1 = "";
      try {
        await service.login(input);
      } catch (e) {
        errorMsg1 = (e as UnauthorizedError).message;
      }

      vi.mocked(authRepo.findByEmail).mockResolvedValue(makeUser());
      vi.mocked(bcrypt.compare).mockResolvedValue(false as never);
      let errorMsg2 = "";
      try {
        await service.login(input);
      } catch (e) {
        errorMsg2 = (e as UnauthorizedError).message;
      }

      expect(errorMsg1).toBe(errorMsg2);
      expect(errorMsg1).toBe("Credenciales inválidas");
    });

    it("caso feliz: devuelve AuthResponseDTO con token y usuario correcto, sin passwordHash", async () => {
      const user = makeUser();
      vi.mocked(authRepo.findByEmail).mockResolvedValue(user);
      vi.mocked(bcrypt.compare).mockResolvedValue(true as never);

      const result = await service.login(input);

      expect(typeof result.token).toBe("string");
      expect(result.token.length).toBeGreaterThan(0);
      expect(result.user.email).toBe("test@example.com");
      expect(result.user.firstName).toBe("Juan");
      expect(result.user.lastName).toBe("Pérez");
      expect(result.user.role).toBe("CUSTOMER");
      expect(result.user).not.toHaveProperty("passwordHash");
      expect(result).not.toHaveProperty("passwordHash");
    });
  });

  describe("getProfile", () => {
    it("llama a repository.findById con el userId exacto", async () => {
      const user = makeUser();
      vi.mocked(authRepo.findById).mockResolvedValue(user);

      const result = await service.getProfile("user-1");

      expect(authRepo.findById).toHaveBeenCalledWith("user-1");
      expect(authRepo.findById).toHaveBeenCalledOnce();
      expect(result.id).toBe("user-1");
      expect(result.email).toBe("test@example.com");
      expect(result).not.toHaveProperty("passwordHash");
    });

    it("lanza NotFoundError si el usuario no existe", async () => {
      vi.mocked(authRepo.findById).mockResolvedValue(null);

      await expect(service.getProfile("nonexistent")).rejects.toThrow(NotFoundError);
    });
  });
});
