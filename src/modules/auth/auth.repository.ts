import type { PrismaClient, User, Role, Prisma } from "@prisma/client";

export interface CreateUserData {
  email: string;
  passwordHash: string;
  firstName: string;
  lastName: string;
  phone?: string;
}

export interface UpdateUserData {
  email?: string;
  firstName?: string;
  lastName?: string;
  phone?: string | null;
}

export interface AuthFilters {
  role?: Role;
  search?: string;
}

export interface AuthPagination {
  page: number;
  limit: number;
}

export interface AuthRepository {
  findByEmail(email: string): Promise<User | null>;
  findById(id: string): Promise<User | null>;
  create(data: CreateUserData): Promise<User>;
  update(userId: string, data: UpdateUserData): Promise<User>;
  updatePassword(userId: string, passwordHash: string): Promise<void>;
  findAllAdmin(
    filters: AuthFilters,
    pagination: AuthPagination,
  ): Promise<{ users: User[]; total: number }>;
}

export class PrismaAuthRepository implements AuthRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findByEmail(email: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { email } });
  }

  async findById(id: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { id } });
  }

  async create(data: CreateUserData): Promise<User> {
    return this.prisma.user.create({ data });
  }

  async updatePassword(userId: string, passwordHash: string): Promise<void> {
    await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash },
    });
  }

  async update(userId: string, data: UpdateUserData): Promise<User> {
    return this.prisma.user.update({
      where: { id: userId },
      data,
    });
  }

  async findAllAdmin(filters: AuthFilters, pagination: AuthPagination) {
    const { page, limit } = pagination;
    const skip = (page - 1) * limit;
    const where: Prisma.UserWhereInput = {};
    if (filters.role) where.role = filters.role;
    if (filters.search) {
      where.OR = [
        { email: { contains: filters.search, mode: "insensitive" } },
        { firstName: { contains: filters.search, mode: "insensitive" } },
        { lastName: { contains: filters.search, mode: "insensitive" } },
      ];
    }

    const [users, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
      }),
      this.prisma.user.count({ where }),
    ]);

    return { users, total };
  }
}
