import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../../src/config/env.js", () => ({
  env: {
    JWT_SECRET: "test-jwt-secret",
    JWT_EXPIRES_IN: "15m",
    REFRESH_TOKEN_EXPIRES_IN_DAYS: 30,
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
import type { RefreshTokenRepository } from "../../../src/modules/auth/refresh-token.repository.js";
import type { User, Role, RefreshToken } from "@prisma/client";
import {
  ConflictError,
  UnauthorizedError,
  NotFoundError,
} from "../../../src/shared/errors/app-error.js";
import { hashRefreshToken } from "../../../src/shared/utils/refreshToken.js";
import bcrypt from "bcrypt";

function mockAuthRepo(): AuthRepository {
  return {
    findByEmail: vi.fn(),
    findById: vi.fn(),
    create: vi.fn(),
  };
}

function mockRefreshTokenRepo(): RefreshTokenRepository {
  return {
    create: vi.fn(),
    findByHash: vi.fn(),
    revoke: vi.fn(),
    revokeAllForUser: vi.fn(),
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

function makeRefreshToken(
  overrides: Partial<RefreshToken> = {},
): RefreshToken {
  return {
    id: "token-1",
    userId: "user-1",
    tokenHash: "hash-of-token",
    expiresAt: new Date("2030-01-01"),
    revokedAt: null,
    replacedByTokenId: null,
    createdAt: new Date("2026-01-01"),
    ...overrides,
  };
}

describe("AuthServiceImpl", () => {
  let authRepo: ReturnType<typeof mockAuthRepo>;
  let refreshTokenRepo: ReturnType<typeof mockRefreshTokenRepo>;
  let service: AuthServiceImpl;

  beforeEach(() => {
    vi.clearAllMocks();
    authRepo = mockAuthRepo();
    refreshTokenRepo = mockRefreshTokenRepo();
    service = new AuthServiceImpl(authRepo, refreshTokenRepo);
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

    it("el AuthResponseDTO no contiene passwordHash y emite accessToken + refreshToken", async () => {
      vi.mocked(authRepo.findByEmail).mockResolvedValue(null);
      vi.mocked(bcrypt.hash).mockResolvedValue("$2b$12$hashedpassword" as never);
      vi.mocked(authRepo.create).mockResolvedValue(makeUser());

      const result = await service.register(input);

      expect(result).not.toHaveProperty("passwordHash");
      expect(result.user).not.toHaveProperty("passwordHash");
      expect(result.user.email).toBe("test@example.com");
      expect(typeof result.accessToken).toBe("string");
      expect(typeof result.refreshToken).toBe("string");
    });

    it("guarda el hash del refresh token (nunca el token en texto plano)", async () => {
      vi.mocked(authRepo.findByEmail).mockResolvedValue(null);
      vi.mocked(bcrypt.hash).mockResolvedValue("$2b$12$hashedpassword" as never);
      vi.mocked(authRepo.create).mockResolvedValue(makeUser());

      const result = await service.register(input);

      expect(refreshTokenRepo.create).toHaveBeenCalledOnce();
      const [userId, tokenHash, expiresAt] =
        vi.mocked(refreshTokenRepo.create).mock.calls[0];
      expect(userId).toBe("user-1");
      expect(tokenHash).toBe(hashRefreshToken(result.refreshToken));
      expect(tokenHash).not.toBe(result.refreshToken);
      expect(expiresAt).toBeInstanceOf(Date);
      expect(expiresAt.getTime()).toBeGreaterThan(Date.now());
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

    it("caso feliz: devuelve AuthResponseDTO con accessToken/refreshToken y usuario correcto, sin passwordHash", async () => {
      const user = makeUser();
      vi.mocked(authRepo.findByEmail).mockResolvedValue(user);
      vi.mocked(bcrypt.compare).mockResolvedValue(true as never);

      const result = await service.login(input);

      expect(typeof result.accessToken).toBe("string");
      expect(result.accessToken.length).toBeGreaterThan(0);
      expect(typeof result.refreshToken).toBe("string");
      expect(result.refreshToken.length).toBeGreaterThan(0);
      expect(result.user.email).toBe("test@example.com");
      expect(result.user.firstName).toBe("Juan");
      expect(result.user.lastName).toBe("Pérez");
      expect(result.user.role).toBe("CUSTOMER");
      expect(result.user).not.toHaveProperty("passwordHash");
      expect(result).not.toHaveProperty("passwordHash");
    });

    it("persiste el refresh token hasheado y con expiración futura", async () => {
      vi.mocked(authRepo.findByEmail).mockResolvedValue(makeUser());
      vi.mocked(bcrypt.compare).mockResolvedValue(true as never);

      const result = await service.login(input);

      expect(refreshTokenRepo.create).toHaveBeenCalledOnce();
      const [userId, tokenHash, expiresAt] =
        vi.mocked(refreshTokenRepo.create).mock.calls[0];
      expect(userId).toBe("user-1");
      expect(tokenHash).toBe(hashRefreshToken(result.refreshToken));
      expect(expiresAt).toBeInstanceOf(Date);
      expect(expiresAt.getTime()).toBeGreaterThan(Date.now());
    });
  });

  describe("refresh", () => {
    it("lanza UnauthorizedError si el token no existe", async () => {
      vi.mocked(refreshTokenRepo.findByHash).mockResolvedValue(null);

      await expect(service.refresh("nonexistent-token")).rejects.toThrow(
        UnauthorizedError,
      );
      expect(refreshTokenRepo.revokeAllForUser).not.toHaveBeenCalled();
    });

    it("token revocado → UnauthorizedError y revoca TODA la cadena del usuario (detección de reuso)", async () => {
      const record = makeRefreshToken({ revokedAt: new Date("2026-06-01") });
      vi.mocked(refreshTokenRepo.findByHash).mockResolvedValue(record);

      await expect(service.refresh("used-token")).rejects.toThrow(
        UnauthorizedError,
      );
      expect(refreshTokenRepo.revokeAllForUser).toHaveBeenCalledWith("user-1");
    });

    it("lanza UnauthorizedError si el token está expirado", async () => {
      const record = makeRefreshToken({
        expiresAt: new Date("2026-01-01"),
      });
      vi.mocked(refreshTokenRepo.findByHash).mockResolvedValue(record);

      await expect(service.refresh("expired-token")).rejects.toThrow(
        UnauthorizedError,
      );
      expect(refreshTokenRepo.revokeAllForUser).not.toHaveBeenCalled();
    });

    it("caso feliz: emite nuevos tokens y revoca el usado con replacedByTokenId", async () => {
      const record = makeRefreshToken();
      vi.mocked(refreshTokenRepo.findByHash).mockResolvedValue(record);
      vi.mocked(authRepo.findById).mockResolvedValue(makeUser());
      const newRecord = makeRefreshToken({ id: "token-2" });
      vi.mocked(refreshTokenRepo.create).mockResolvedValue(newRecord);

      const result = await service.refresh("old-plain-token");

      expect(typeof result.accessToken).toBe("string");
      expect(result.accessToken.length).toBeGreaterThan(0);
      expect(typeof result.refreshToken).toBe("string");
      expect(result.refreshToken.length).toBeGreaterThan(0);

      expect(refreshTokenRepo.create).toHaveBeenCalledWith(
        "user-1",
        hashRefreshToken(result.refreshToken),
        expect.any(Date),
      );
      expect(refreshTokenRepo.revoke).toHaveBeenCalledWith(
        "token-1",
        "token-2",
      );
    });
  });

  describe("logout", () => {
    it("con token válido llama a revoke", async () => {
      const record = makeRefreshToken();
      vi.mocked(refreshTokenRepo.findByHash).mockResolvedValue(record);

      await service.logout("valid-token");

      expect(refreshTokenRepo.revoke).toHaveBeenCalledWith("token-1");
      expect(refreshTokenRepo.revoke).toHaveBeenCalledOnce();
    });

    it("con token inexistente no lanza error y no llama a revoke", async () => {
      vi.mocked(refreshTokenRepo.findByHash).mockResolvedValue(null);

      await expect(service.logout("unknown-token")).resolves.toBeUndefined();
      expect(refreshTokenRepo.revoke).not.toHaveBeenCalled();
    });

    it("con token ya revocado no lanza error (idempotente)", async () => {
      const record = makeRefreshToken({ revokedAt: new Date("2026-06-01") });
      vi.mocked(refreshTokenRepo.findByHash).mockResolvedValue(record);

      await expect(service.logout("already-revoked-token")).resolves.toBeUndefined();
      expect(refreshTokenRepo.revoke).not.toHaveBeenCalled();
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
