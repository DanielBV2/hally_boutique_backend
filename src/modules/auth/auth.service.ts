import bcrypt from "bcrypt";
import jsonwebtoken from "jsonwebtoken";
import { randomUUID } from "node:crypto";
import type { AuthRepository, AuthFilters, AuthPagination } from "./auth.repository.js";
import type { RefreshTokenRepository } from "./refresh-token.repository.js";
import type { PasswordResetTokenRepository } from "./password-reset-token.repository.js";
import type {
  AuthResponseDTO,
  RefreshResponseDTO,
  UserProfileDTO,
  AdminUserListItemDTO,
} from "./auth.dto.js";
import type {
  RegisterInput,
  LoginInput,
  UpdateProfileInput,
  ChangePasswordInput,
} from "./auth.schema.js";
import { ConflictError, UnauthorizedError, NotFoundError } from "../../shared/errors/app-error.js";
import { env } from "../../config/env.js";
import { generateRefreshToken, hashRefreshToken } from "../../shared/utils/refreshToken.js";
import { sendPasswordResetEmail } from "../../shared/utils/emailClient.js";
import { logger } from "../../shared/utils/logger.js";
import type { Role } from "@prisma/client";

const SALT_ROUNDS = 12;
const INVALID_SESSION_MESSAGE = "Sesión inválida, por favor inicia sesión de nuevo";
const INVALID_RESET_TOKEN_MESSAGE = "Token inválido o expirado";

export interface AuthService {
  register(data: RegisterInput): Promise<AuthResponseDTO>;
  login(data: LoginInput): Promise<AuthResponseDTO>;
  refresh(refreshTokenPlain: string): Promise<RefreshResponseDTO>;
  logout(refreshTokenPlain: string): Promise<void>;
  forgotPassword(email: string): Promise<void>;
  resetPassword(token: string, newPassword: string): Promise<void>;
  getProfile(userId: string): Promise<UserProfileDTO>;
  updateProfile(userId: string, data: UpdateProfileInput): Promise<UserProfileDTO>;
  changePassword(userId: string, data: ChangePasswordInput): Promise<void>;
  listUsersAdmin(
    filters: AuthFilters,
    pagination: AuthPagination,
  ): Promise<{ items: AdminUserListItemDTO[]; total: number }>;
}

function toUserProfileDTO(user: {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  role: Role;
  createdAt: Date;
}): UserProfileDTO {
  return {
    id: user.id,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    phone: user.phone,
    role: user.role,
    createdAt: user.createdAt,
  };
}

function toAdminUserListItemDTO(user: {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: Role;
  createdAt: Date;
}): AdminUserListItemDTO {
  return {
    id: user.id,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    role: user.role,
    createdAt: user.createdAt,
  };
}

function signToken(payload: { sub: string; email: string; role: Role }): string {
  return jsonwebtoken.sign(
    { email: payload.email, role: payload.role, jti: randomUUID() },
    env.JWT_SECRET,
    {
      subject: payload.sub,
      issuer: env.JWT_ISSUER,
      audience: env.JWT_AUDIENCE,
      expiresIn: env.JWT_EXPIRES_IN,
    } as jsonwebtoken.SignOptions,
  );
}

export class AuthServiceImpl implements AuthService {
  constructor(
    private readonly repository: AuthRepository,
    private readonly refreshTokenRepository: RefreshTokenRepository,
    private readonly passwordResetTokenRepository: PasswordResetTokenRepository,
  ) {}

  private refreshTokenExpiresAt(): Date {
    return new Date(Date.now() + env.REFRESH_TOKEN_EXPIRES_IN_DAYS * 24 * 60 * 60 * 1000);
  }

  private passwordResetTokenExpiresAt(): Date {
    return new Date(Date.now() + env.PASSWORD_RESET_TOKEN_EXPIRES_IN_MINUTES * 60 * 1000);
  }

  async register(data: RegisterInput): Promise<AuthResponseDTO> {
    const existing = await this.repository.findByEmail(data.email);
    if (existing) {
      throw new ConflictError("El correo ya está registrado");
    }

    const passwordHash = await bcrypt.hash(data.password, SALT_ROUNDS);

    const user = await this.repository.create({
      email: data.email,
      passwordHash,
      firstName: data.firstName,
      lastName: data.lastName,
      ...(data.phone !== undefined && { phone: data.phone }),
    });

    const accessToken = signToken({
      sub: user.id,
      email: user.email,
      role: user.role,
    });

    const refreshToken = generateRefreshToken();
    await this.refreshTokenRepository.create(
      user.id,
      hashRefreshToken(refreshToken),
      this.refreshTokenExpiresAt(),
    );

    return {
      user: toUserProfileDTO(user),
      accessToken,
      refreshToken,
    };
  }

  async login(data: LoginInput): Promise<AuthResponseDTO> {
    const user = await this.repository.findByEmail(data.email);
    if (!user) {
      throw new UnauthorizedError("Credenciales inválidas");
    }

    const valid = await bcrypt.compare(data.password, user.passwordHash);
    if (!valid) {
      throw new UnauthorizedError("Credenciales inválidas");
    }

    const accessToken = signToken({
      sub: user.id,
      email: user.email,
      role: user.role,
    });

    const refreshToken = generateRefreshToken();
    await this.refreshTokenRepository.create(
      user.id,
      hashRefreshToken(refreshToken),
      this.refreshTokenExpiresAt(),
    );

    return {
      user: toUserProfileDTO(user),
      accessToken,
      refreshToken,
    };
  }

  async refresh(refreshTokenPlain: string): Promise<RefreshResponseDTO> {
    const tokenHash = hashRefreshToken(refreshTokenPlain);
    const record = await this.refreshTokenRepository.findByHash(tokenHash);

    if (!record) {
      throw new UnauthorizedError(INVALID_SESSION_MESSAGE);
    }

    if (record.revokedAt !== null) {
      await this.refreshTokenRepository.revokeAllForUser(record.userId);
      throw new UnauthorizedError(INVALID_SESSION_MESSAGE);
    }

    if (record.expiresAt < new Date()) {
      throw new UnauthorizedError(INVALID_SESSION_MESSAGE);
    }

    const user = await this.repository.findById(record.userId);
    if (!user) {
      throw new UnauthorizedError(INVALID_SESSION_MESSAGE);
    }

    const accessToken = signToken({
      sub: user.id,
      email: user.email,
      role: user.role,
    });

    const refreshToken = generateRefreshToken();
    await this.refreshTokenRepository.rotate(record.id, {
      userId: user.id,
      tokenHash: hashRefreshToken(refreshToken),
      expiresAt: this.refreshTokenExpiresAt(),
    });

    return { accessToken, refreshToken };
  }

  async logout(refreshTokenPlain: string): Promise<void> {
    const tokenHash = hashRefreshToken(refreshTokenPlain);
    const record = await this.refreshTokenRepository.findByHash(tokenHash);

    if (record?.revokedAt !== null) {
      return;
    }

    await this.refreshTokenRepository.revoke(record.id);
  }

  async forgotPassword(email: string): Promise<void> {
    const user = await this.repository.findByEmail(email);
    if (!user) {
      return;
    }

    await this.passwordResetTokenRepository.invalidateAllForUser(user.id);

    const tokenPlain = generateRefreshToken();
    await this.passwordResetTokenRepository.create(
      user.id,
      hashRefreshToken(tokenPlain),
      this.passwordResetTokenExpiresAt(),
    );

    const resetUrl = `${env.FRONTEND_RESET_URL}?token=${tokenPlain}`;
    const result = await sendPasswordResetEmail(user.email, resetUrl);
    if (!result.success) {
      logger.error(
        { email: user.email, error: result.error },
        "Error enviando email de restablecimiento de contraseña",
      );
    }
  }

  async resetPassword(token: string, newPassword: string): Promise<void> {
    const tokenHash = hashRefreshToken(token);
    const record = await this.passwordResetTokenRepository.findByHash(tokenHash);

    if (!record) {
      throw new UnauthorizedError(INVALID_RESET_TOKEN_MESSAGE);
    }

    if (record.usedAt !== null) {
      throw new UnauthorizedError(INVALID_RESET_TOKEN_MESSAGE);
    }

    if (record.expiresAt < new Date()) {
      throw new UnauthorizedError(INVALID_RESET_TOKEN_MESSAGE);
    }

    const passwordHash = await bcrypt.hash(newPassword, SALT_ROUNDS);
    await this.repository.updatePassword(record.userId, passwordHash);
    await this.passwordResetTokenRepository.markAsUsed(record.id);
    await this.refreshTokenRepository.revokeAllForUser(record.userId);
  }

  async getProfile(userId: string): Promise<UserProfileDTO> {
    const user = await this.repository.findById(userId);
    if (!user) {
      throw new NotFoundError("User");
    }

    return toUserProfileDTO(user);
  }

  async updateProfile(userId: string, data: UpdateProfileInput): Promise<UserProfileDTO> {
    const user = await this.repository.findById(userId);
    if (!user) {
      throw new NotFoundError("User");
    }

    if (data.email && data.email.toLowerCase() !== user.email.toLowerCase()) {
      const existing = await this.repository.findByEmail(data.email);
      if (existing && existing.id !== userId) {
        throw new ConflictError("El correo ya está registrado");
      }
    }

    const updateData: Parameters<AuthRepository["update"]>[1] = {};
    if (data.firstName !== undefined) updateData.firstName = data.firstName;
    if (data.lastName !== undefined) updateData.lastName = data.lastName;
    if (data.email !== undefined) updateData.email = data.email;
    if (data.phone !== undefined) updateData.phone = data.phone;

    const updated = await this.repository.update(userId, updateData);
    return toUserProfileDTO(updated);
  }

  async changePassword(userId: string, data: ChangePasswordInput): Promise<void> {
    const user = await this.repository.findById(userId);
    if (!user) {
      throw new NotFoundError("User");
    }

    const valid = await bcrypt.compare(data.currentPassword, user.passwordHash);
    if (!valid) {
      throw new UnauthorizedError("La contraseña actual es incorrecta");
    }

    const passwordHash = await bcrypt.hash(data.newPassword, SALT_ROUNDS);
    await this.repository.updatePassword(userId, passwordHash);
    await this.refreshTokenRepository.revokeAllForUser(userId);
  }

  async listUsersAdmin(
    filters: AuthFilters,
    pagination: AuthPagination,
  ): Promise<{ items: AdminUserListItemDTO[]; total: number }> {
    const { users, total } = await this.repository.findAllAdmin(filters, pagination);

    return {
      items: users.map(toAdminUserListItemDTO),
      total,
    };
  }
}
