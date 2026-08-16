import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../../src/config/env.js", () => ({
  env: {
    JWT_SECRET: "test-jwt-secret",
    JWT_EXPIRES_IN: "15m",
    JWT_ISSUER: "test-issuer",
    JWT_AUDIENCE: "test-audience",
    REFRESH_TOKEN_EXPIRES_IN_DAYS: 30,
    PASSWORD_RESET_TOKEN_EXPIRES_IN_MINUTES: 60,
    FRONTEND_RESET_URL: "http://localhost:3000/reset",
  },
}));

vi.mock("bcrypt", () => ({
  default: {
    hash: vi.fn(),
    compare: vi.fn(),
  },
}));

vi.mock("../../../src/shared/utils/emailClient.js", () => ({
  sendPasswordResetEmail: vi.fn(),
}));

import { AuthServiceImpl } from "../../../src/modules/auth/auth.service.js";
import type { AuthRepository } from "../../../src/modules/auth/auth.repository.js";
import type { RefreshTokenRepository } from "../../../src/modules/auth/refresh-token.repository.js";
import type { PasswordResetTokenRepository } from "../../../src/modules/auth/password-reset-token.repository.js";
import type { User, Role, RefreshToken, PasswordResetToken } from "@prisma/client";
import {
  ConflictError,
  UnauthorizedError,
  NotFoundError,
} from "../../../src/shared/errors/app-error.js";
import { hashRefreshToken } from "../../../src/shared/utils/refreshToken.js";
import { sendPasswordResetEmail } from "../../../src/shared/utils/emailClient.js";
import { logger } from "../../../src/shared/utils/logger.js";
import bcrypt from "bcrypt";

function mockAuthRepo(): AuthRepository {
  return {
    findByEmail: vi.fn(),
    findById: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    updatePassword: vi.fn(),
    findAllAdmin: vi.fn(),
  };
}

function mockRefreshTokenRepo(): RefreshTokenRepository {
  return {
    create: vi.fn(),
    findByHash: vi.fn(),
    revoke: vi.fn(),
    revokeAllForUser: vi.fn(),
    rotate: vi.fn(),
  };
}

function mockPasswordResetTokenRepo(): PasswordResetTokenRepository {
  return {
    create: vi.fn(),
    findByHash: vi.fn(),
    invalidateAllForUser: vi.fn(),
    markAsUsed: vi.fn(),
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

function makePasswordResetToken(
  overrides: Partial<PasswordResetToken> = {},
): PasswordResetToken {
  return {
    id: "reset-token-1",
    userId: "user-1",
    tokenHash: "hash-of-reset-token",
    expiresAt: new Date("2030-01-01"),
    usedAt: null,
    createdAt: new Date("2026-01-01"),
    ...overrides,
  };
}

describe("AuthServiceImpl", () => {
  let authRepo: ReturnType<typeof mockAuthRepo>;
  let refreshTokenRepo: ReturnType<typeof mockRefreshTokenRepo>;
  let passwordResetTokenRepo: ReturnType<typeof mockPasswordResetTokenRepo>;
  let service: AuthServiceImpl;

  beforeEach(() => {
    vi.clearAllMocks();
    authRepo = mockAuthRepo();
    refreshTokenRepo = mockRefreshTokenRepo();
    passwordResetTokenRepo = mockPasswordResetTokenRepo();
    service = new AuthServiceImpl(
      authRepo,
      refreshTokenRepo,
      passwordResetTokenRepo,
    );
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

    it("caso feliz: emite nuevos tokens y rota el usado de forma atómica (rotate)", async () => {
      const record = makeRefreshToken();
      vi.mocked(refreshTokenRepo.findByHash).mockResolvedValue(record);
      vi.mocked(authRepo.findById).mockResolvedValue(makeUser());

      const result = await service.refresh("old-plain-token");

      expect(typeof result.accessToken).toBe("string");
      expect(result.accessToken.length).toBeGreaterThan(0);
      expect(typeof result.refreshToken).toBe("string");
      expect(result.refreshToken.length).toBeGreaterThan(0);

      expect(refreshTokenRepo.create).not.toHaveBeenCalled();
      expect(refreshTokenRepo.revoke).not.toHaveBeenCalled();
      expect(refreshTokenRepo.rotate).toHaveBeenCalledOnce();
      expect(refreshTokenRepo.rotate).toHaveBeenCalledWith("token-1", {
        userId: "user-1",
        tokenHash: hashRefreshToken(result.refreshToken),
        expiresAt: expect.any(Date),
      });
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

  describe("forgotPassword", () => {
    it("con email inexistente no lanza error y no llama a sendPasswordResetEmail", async () => {
      vi.mocked(authRepo.findByEmail).mockResolvedValue(null);

      await expect(service.forgotPassword("ghost@example.com")).resolves.toBeUndefined();

      expect(authRepo.findByEmail).toHaveBeenCalledWith("ghost@example.com");
      expect(passwordResetTokenRepo.invalidateAllForUser).not.toHaveBeenCalled();
      expect(passwordResetTokenRepo.create).not.toHaveBeenCalled();
      expect(sendPasswordResetEmail).not.toHaveBeenCalled();
    });

    it("con email existente invalida tokens previos, crea uno nuevo y envía el email con la URL correcta", async () => {
      vi.mocked(authRepo.findByEmail).mockResolvedValue(makeUser());
      vi.mocked(sendPasswordResetEmail).mockResolvedValue({
        success: true,
      } as never);

      await service.forgotPassword("test@example.com");

      expect(passwordResetTokenRepo.invalidateAllForUser).toHaveBeenCalledWith("user-1");
      expect(passwordResetTokenRepo.create).toHaveBeenCalledOnce();
      const [userId, tokenHash, expiresAt] =
        vi.mocked(passwordResetTokenRepo.create).mock.calls[0];
      expect(userId).toBe("user-1");
      expect(tokenHash).toBeTruthy();
      expect(expiresAt).toBeInstanceOf(Date);
      expect(expiresAt.getTime()).toBeGreaterThan(Date.now());

      expect(sendPasswordResetEmail).toHaveBeenCalledOnce();
      const [to, resetUrl] =
        vi.mocked(sendPasswordResetEmail).mock.calls[0];
      expect(to).toBe("test@example.com");
      const tokenParam = resetUrl.split("?token=")[1];
      expect(hashRefreshToken(tokenParam)).toBe(tokenHash);
      expect(resetUrl).toContain("http://localhost:3000/reset?token=");
    });

    it("si el envío de email falla solo loguea, no lanza error al caller", async () => {
      const loggerErrorSpy = vi
        .spyOn(logger, "error")
        .mockImplementation(() => {});
      vi.mocked(authRepo.findByEmail).mockResolvedValue(makeUser());
      vi.mocked(sendPasswordResetEmail).mockResolvedValue({
        success: false,
        error: "Resend rate limited",
      } as never);

      await expect(service.forgotPassword("test@example.com")).resolves.toBeUndefined();

      expect(loggerErrorSpy).toHaveBeenCalled();
      loggerErrorSpy.mockRestore();
    });
  });

  describe("resetPassword", () => {
    it("lanza UnauthorizedError si el token no existe", async () => {
      vi.mocked(passwordResetTokenRepo.findByHash).mockResolvedValue(null);

      let error: UnauthorizedError | undefined;
      try {
        await service.resetPassword("nonexistent-token", "NewPassword1");
      } catch (e) {
        error = e as UnauthorizedError;
      }

      expect(error).toBeInstanceOf(UnauthorizedError);
      expect(error!.message).toBe("Token inválido o expirado");
      expect(bcrypt.hash).not.toHaveBeenCalled();
      expect(passwordResetTokenRepo.markAsUsed).not.toHaveBeenCalled();
    });

    it("lanza UnauthorizedError con el MISMO mensaje si el token ya fue usado", async () => {
      const record = makePasswordResetToken({ usedAt: new Date("2026-06-01") });
      vi.mocked(passwordResetTokenRepo.findByHash).mockResolvedValue(record);

      let error: UnauthorizedError | undefined;
      try {
        await service.resetPassword("used-token", "NewPassword1");
      } catch (e) {
        error = e as UnauthorizedError;
      }

      expect(error).toBeInstanceOf(UnauthorizedError);
      expect(error!.message).toBe("Token inválido o expirado");
    });

    it("lanza UnauthorizedError si el token está expirado", async () => {
      const record = makePasswordResetToken({
        expiresAt: new Date("2026-01-01"),
      });
      vi.mocked(passwordResetTokenRepo.findByHash).mockResolvedValue(record);

      await expect(
        service.resetPassword("expired-token", "NewPassword1"),
      ).rejects.toThrow(UnauthorizedError);
      expect(bcrypt.hash).not.toHaveBeenCalled();
      expect(passwordResetTokenRepo.markAsUsed).not.toHaveBeenCalled();
    });

    it("caso feliz: hashea la nueva password, actualiza el hash, marca el token usado y revoca todas las sesiones", async () => {
      const record = makePasswordResetToken();
      vi.mocked(passwordResetTokenRepo.findByHash).mockResolvedValue(record);
      vi.mocked(bcrypt.hash).mockResolvedValue("$2b$12$newhashedpassword" as never);

      await service.resetPassword("valid-plain-token", "NewPassword1");

      expect(bcrypt.hash).toHaveBeenCalledWith("NewPassword1", 12);
      expect(authRepo.updatePassword).toHaveBeenCalledWith(
        "user-1",
        "$2b$12$newhashedpassword",
      );
      expect(passwordResetTokenRepo.markAsUsed).toHaveBeenCalledWith(
        "reset-token-1",
      );
      expect(refreshTokenRepo.revokeAllForUser).toHaveBeenCalledWith("user-1");
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

  describe("updateProfile", () => {
    it("actualiza los campos provistos y devuelve el perfil sin passwordHash", async () => {
      const user = makeUser();
      const updated = makeUser({
        firstName: "María",
        lastName: "Gómez",
        phone: "3009876543",
      });
      vi.mocked(authRepo.findById).mockResolvedValue(user);
      vi.mocked(authRepo.update).mockResolvedValue(updated);

      const result = await service.updateProfile("user-1", {
        firstName: "María",
        lastName: "Gómez",
        phone: "3009876543",
      });

      expect(authRepo.update).toHaveBeenCalledWith("user-1", {
        firstName: "María",
        lastName: "Gómez",
        phone: "3009876543",
      });
      expect(authRepo.update).toHaveBeenCalledOnce();
      expect(result.firstName).toBe("María");
      expect(result.phone).toBe("3009876543");
      expect(result).not.toHaveProperty("passwordHash");
    });

    it("no consulta findByEmail si el email no cambia", async () => {
      const user = makeUser({ email: "test@example.com" });
      vi.mocked(authRepo.findById).mockResolvedValue(user);
      vi.mocked(authRepo.update).mockResolvedValue(user);

      await service.updateProfile("user-1", { firstName: "Juan" });

      expect(authRepo.findByEmail).not.toHaveBeenCalled();
      expect(authRepo.update).toHaveBeenCalledWith("user-1", {
        firstName: "Juan",
      });
    });

    it("permite actualizar el email propio (mismo id no es conflicto)", async () => {
      const user = makeUser({ email: "test@example.com" });
      const updated = makeUser({ email: "nuevo@example.com" });
      vi.mocked(authRepo.findById).mockResolvedValue(user);
      vi.mocked(authRepo.findByEmail).mockResolvedValue(user);
      vi.mocked(authRepo.update).mockResolvedValue(updated);

      const result = await service.updateProfile("user-1", {
        email: "nuevo@example.com",
      });

      expect(authRepo.findByEmail).toHaveBeenCalledWith("nuevo@example.com");
      expect(authRepo.update).toHaveBeenCalledWith("user-1", {
        email: "nuevo@example.com",
      });
      expect(result.email).toBe("nuevo@example.com");
    });

    it("lanza ConflictError si el email pertenece a otro usuario", async () => {
      const user = makeUser();
      const otherUser = makeUser({ id: "user-2", email: "otro@example.com" });
      vi.mocked(authRepo.findById).mockResolvedValue(user);
      vi.mocked(authRepo.findByEmail).mockResolvedValue(otherUser);

      await expect(
        service.updateProfile("user-1", { email: "otro@example.com" }),
      ).rejects.toThrow(ConflictError);
      expect(authRepo.update).not.toHaveBeenCalled();
    });

    it("omite los campos undefined y pasa phone null explícitamente", async () => {
      const user = makeUser();
      vi.mocked(authRepo.findById).mockResolvedValue(user);
      vi.mocked(authRepo.update).mockResolvedValue(makeUser({ phone: null }));

      await service.updateProfile("user-1", { phone: null });

      expect(authRepo.update).toHaveBeenCalledWith("user-1", { phone: null });
    });

    it("lanza NotFoundError si el usuario no existe", async () => {
      vi.mocked(authRepo.findById).mockResolvedValue(null);

      await expect(
        service.updateProfile("nonexistent", { firstName: "X" }),
      ).rejects.toThrow(NotFoundError);
      expect(authRepo.update).not.toHaveBeenCalled();
    });
  });

  describe("listUsersAdmin", () => {
    it("pasa el filtro de role al repository junto con la paginación", async () => {
      vi.mocked(authRepo.findAllAdmin).mockResolvedValue({ users: [], total: 0 });

      await service.listUsersAdmin({ role: "ADMIN" }, { page: 2, limit: 50 });

      expect(authRepo.findAllAdmin).toHaveBeenCalledWith(
        { role: "ADMIN" },
        { page: 2, limit: 50 },
      );
      expect(authRepo.findAllAdmin).toHaveBeenCalledOnce();
    });

    it("sin filtro de role pasa filters vacíos", async () => {
      vi.mocked(authRepo.findAllAdmin).mockResolvedValue({ users: [], total: 0 });

      await service.listUsersAdmin({}, { page: 1, limit: 20 });

      expect(authRepo.findAllAdmin).toHaveBeenCalledWith(
        {},
        { page: 1, limit: 20 },
      );
    });

    it("ningún AdminUserListItemDTO incluye passwordHash", async () => {
      const users = [
        makeUser({ id: "u1", role: "CUSTOMER" }),
        makeUser({
          id: "u2",
          email: "admin@example.com",
          role: "ADMIN",
        }),
      ];
      vi.mocked(authRepo.findAllAdmin).mockResolvedValue({ users, total: 2 });

      const result = await service.listUsersAdmin({}, { page: 1, limit: 20 });

      expect(authRepo.findAllAdmin).toHaveBeenCalledOnce();
      expect(result.total).toBe(2);
      expect(result.items).toHaveLength(2);
      for (const item of result.items) {
        expect(item).not.toHaveProperty("passwordHash");
      }
      expect(result.items[0]).toMatchObject({
        id: "u1",
        email: "test@example.com",
        role: "CUSTOMER",
      });
      expect(result.items[1]).toMatchObject({
        id: "u2",
        email: "admin@example.com",
        firstName: "Juan",
        lastName: "Pérez",
        role: "ADMIN",
        createdAt: new Date("2026-01-01"),
      });
    });
  });

  describe("changePassword", () => {
    const input = { currentPassword: "OldPassword1", newPassword: "NewPassword1" };

    it("lanza NotFoundError si el usuario no existe", async () => {
      vi.mocked(authRepo.findById).mockResolvedValue(null);

      await expect(
        service.changePassword("user-1", input),
      ).rejects.toThrow(NotFoundError);
      expect(bcrypt.compare).not.toHaveBeenCalled();
    });

    it("lanza UnauthorizedError si la contraseña actual es incorrecta", async () => {
      vi.mocked(authRepo.findById).mockResolvedValue(makeUser());
      vi.mocked(bcrypt.compare).mockResolvedValue(false as never);

      let error: UnauthorizedError | undefined;
      try {
        await service.changePassword("user-1", input);
      } catch (e) {
        error = e as UnauthorizedError;
      }

      expect(error).toBeInstanceOf(UnauthorizedError);
      expect(error!.message).toBe("La contraseña actual es incorrecta");
      expect(bcrypt.hash).not.toHaveBeenCalled();
      expect(authRepo.updatePassword).not.toHaveBeenCalled();
    });

    it("caso feliz: verifica la actual, hashea la nueva y revoca todas las sesiones", async () => {
      vi.mocked(authRepo.findById).mockResolvedValue(makeUser());
      vi.mocked(bcrypt.compare).mockResolvedValue(true as never);
      vi.mocked(bcrypt.hash).mockResolvedValue("$2b$12$newhashedpassword" as never);

      await service.changePassword("user-1", input);

      expect(bcrypt.compare).toHaveBeenCalledWith(
        "OldPassword1",
        "$2b$12$hashedpassword",
      );
      expect(bcrypt.hash).toHaveBeenCalledWith("NewPassword1", 12);
      expect(authRepo.updatePassword).toHaveBeenCalledWith(
        "user-1",
        "$2b$12$newhashedpassword",
      );
      expect(refreshTokenRepo.revokeAllForUser).toHaveBeenCalledWith("user-1");
    });

    it("nunca guarda la nueva contraseña en texto plano", async () => {
      vi.mocked(authRepo.findById).mockResolvedValue(makeUser());
      vi.mocked(bcrypt.compare).mockResolvedValue(true as never);
      vi.mocked(bcrypt.hash).mockResolvedValue("$2b$12$newhashedpassword" as never);

      await service.changePassword("user-1", input);

      const hashArg = vi.mocked(bcrypt.hash).mock.calls[0][0];
      expect(hashArg).toBe("NewPassword1");
      const updateArg = vi.mocked(authRepo.updatePassword).mock.calls[0][1];
      expect(updateArg).toBe("$2b$12$newhashedpassword");
      expect(updateArg).not.toBe("NewPassword1");
    });
  });
});
