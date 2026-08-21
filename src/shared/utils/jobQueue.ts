import type { PrismaClient, Prisma } from "@prisma/client";

export interface EnqueueJobInput {
  type: string;
  payload: unknown;
  uniqueKey: string;
}

export interface JobQueue {
  // Debe poder llamarse dentro de una transacción de Prisma existente,
  // para que "cambio de estado de negocio" + "job encolado" sean atómicos.
  enqueue(input: EnqueueJobInput, tx?: Prisma.TransactionClient): Promise<void>;
}

export class PrismaJobQueue implements JobQueue {
  constructor(private readonly prisma: PrismaClient) {}

  async enqueue(input: EnqueueJobInput, tx?: Prisma.TransactionClient): Promise<void> {
    const client = tx ?? this.prisma;
    // Si ya existe un job con ese uniqueKey, es un no-op silencioso
    // (idempotencia) — no lanza error ni duplica el job.
    await client.backgroundJob.upsert({
      where: { uniqueKey: input.uniqueKey },
      create: {
        type: input.type,
        payload: input.payload as Prisma.InputJsonValue,
        uniqueKey: input.uniqueKey,
      },
      update: {},
    });
  }
}
