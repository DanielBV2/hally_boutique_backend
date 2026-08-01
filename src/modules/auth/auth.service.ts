import bcrypt from "bcrypt";
import jsonwebtoken from "jsonwebtoken";
import type { AuthRepository } from "./auth.repository.js";
import type { RefreshTokenRepository } from "./refresh-token.repository.js";
import type {
  AuthResponseDTO,
  RefreshResponseDTO,
  UserProfileDTO,
} from "./auth.dto.js";
import type { RegisterInput, LoginInput } from "./auth.schema.js";
import {
  ConflictError,
  UnauthorizedError,
  NotFoundError,
} from "../../shared/errors/app-error.js";
import { env } from "../../config/env.js";
import {
  generateRefreshToken,
  hashRefreshToken,
} from "../../shared/utils/refreshToken.js";
import type { Role } from "@prisma/client";

const SALT_ROUNDS = 12;
const INVALID_SESSION_MESSAGE =
  "Sesión inválida, por favor inicia sesión de nuevo";

export interface AuthService {
  register(data: RegisterInput): Promise<AuthResponseDTO>;
  login(data: LoginInput): Promise<AuthResponseDTO>;
  refresh(refreshTokenPlain: string): Promise<RefreshResponseDTO>;
  logout(refreshTokenPlain: string): Promise<void>;
  getProfile(userId: string): Promise<UserProfileDTO>;
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

function signToken(payload: {
  sub: string;
  email: string;
  role: Role;
}): string {
  return jsonwebtoken.sign(
    { email: payload.email, role: payload.role },
    env.JWT_SECRET,
    {
      subject: payload.sub,
      expiresIn: env.JWT_EXPIRES_IN,
    } as jsonwebtoken.SignOptions,
  );
}

export class AuthServiceImpl implements AuthService {
  constructor(
    private readonly repository: AuthRepository,
    private readonly refreshTokenRepository: RefreshTokenRepository,
  ) {}

  private refreshTokenExpiresAt(): Date {
    return new Date(
      Date.now() + env.REFRESH_TOKEN_EXPIRES_IN_DAYS * 24 * 60 * 60 * 1000,
    );
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
    const newRecord = await this.refreshTokenRepository.create(
      user.id,
      hashRefreshToken(refreshToken),
      this.refreshTokenExpiresAt(),
    );
    await this.refreshTokenRepository.revoke(record.id, newRecord.id);

    return { accessToken, refreshToken };
  }

  async logout(refreshTokenPlain: string): Promise<void> {
    const tokenHash = hashRefreshToken(refreshTokenPlain);
    const record = await this.refreshTokenRepository.findByHash(tokenHash);

    if (!record || record.revokedAt !== null) {
      return;
    }

    await this.refreshTokenRepository.revoke(record.id);
  }

  async getProfile(userId: string): Promise<UserProfileDTO> {
    const user = await this.repository.findById(userId);
    if (!user) {
      throw new NotFoundError("User");
    }

    return toUserProfileDTO(user);
  }
}
