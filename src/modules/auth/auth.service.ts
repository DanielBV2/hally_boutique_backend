import bcrypt from "bcrypt";
import jsonwebtoken from "jsonwebtoken";
import type { AuthRepository } from "./auth.repository.js";
import type { AuthResponseDTO, UserProfileDTO } from "./auth.dto.js";
import type { RegisterInput, LoginInput } from "./auth.schema.js";
import {
  ConflictError,
  UnauthorizedError,
  NotFoundError,
} from "../../shared/errors/app-error.js";
import { env } from "../../config/env.js";
import type { Role } from "@prisma/client";

const SALT_ROUNDS = 12;

export interface AuthService {
  register(data: RegisterInput): Promise<AuthResponseDTO>;
  login(data: LoginInput): Promise<AuthResponseDTO>;
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
  constructor(private readonly repository: AuthRepository) {}

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

    const token = signToken({
      sub: user.id,
      email: user.email,
      role: user.role,
    });

    return {
      user: toUserProfileDTO(user),
      token,
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

    const token = signToken({
      sub: user.id,
      email: user.email,
      role: user.role,
    });

    return {
      user: toUserProfileDTO(user),
      token,
    };
  }

  async getProfile(userId: string): Promise<UserProfileDTO> {
    const user = await this.repository.findById(userId);
    if (!user) {
      throw new NotFoundError("User");
    }

    return toUserProfileDTO(user);
  }
}
