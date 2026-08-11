import type { PrismaClient, RefreshToken } from "@prisma/client";

export interface RefreshTokenRepository {
  create(userId: string, tokenHash: string, expiresAt: Date): Promise<RefreshToken>;
  findByHash(tokenHash: string): Promise<RefreshToken | null>;
  revoke(id: string, replacedByTokenId?: string): Promise<void>;
  revokeAllForUser(userId: string): Promise<void>;
  rotate(
    oldTokenId: string,
    data: { userId: string; tokenHash: string; expiresAt: Date },
  ): Promise<RefreshToken>;
}

export class PrismaRefreshTokenRepository implements RefreshTokenRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async create(userId: string, tokenHash: string, expiresAt: Date): Promise<RefreshToken> {
    return this.prisma.refreshToken.create({
      data: { userId, tokenHash, expiresAt },
    });
  }

  async findByHash(tokenHash: string): Promise<RefreshToken | null> {
    return this.prisma.refreshToken.findUnique({ where: { tokenHash } });
  }

  async revoke(id: string, replacedByTokenId?: string): Promise<void> {
    await this.prisma.refreshToken.update({
      where: { id },
      data: {
        revokedAt: new Date(),
        ...(replacedByTokenId !== undefined && { replacedByTokenId }),
      },
    });
  }

  async revokeAllForUser(userId: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  async rotate(
    oldTokenId: string,
    data: { userId: string; tokenHash: string; expiresAt: Date },
  ): Promise<RefreshToken> {
    return this.prisma.$transaction(async (tx) => {
      const newToken = await tx.refreshToken.create({
        data: { userId: data.userId, tokenHash: data.tokenHash, expiresAt: data.expiresAt },
      });
      await tx.refreshToken.update({
        where: { id: oldTokenId },
        data: { revokedAt: new Date(), replacedByTokenId: newToken.id },
      });
      return newToken;
    });
  }
}
