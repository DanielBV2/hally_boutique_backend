import { describe, it, expect, vi } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { JobWorker, type JobHandler } from "../../../src/shared/utils/jobWorker.js";
import { logger } from "../../../src/shared/utils/logger.js";

function mockPrisma() {
  return {
    backgroundJob: {
      update: vi.fn().mockResolvedValue({}),
    },
  };
}

interface RunJobAccess {
  runJob(job: {
    id: string;
    type: string;
    payload: unknown;
    attempts: number;
    maxAttempts: number;
  }): Promise<void>;
}

function makeWorker(
  prisma: ReturnType<typeof mockPrisma>,
  register?: (worker: JobWorker) => void,
): JobWorker {
  const worker = new JobWorker(prisma as unknown as PrismaClient, {
    pollIntervalMs: 60_000,
    batchSize: 5,
  });
  if (register) register(worker);
  return worker;
}

async function invokeRunJob(worker: JobWorker, job: Parameters<RunJobAccess["runJob"]>[0]) {
  await (worker as unknown as RunJobAccess).runJob(job);
}

function makeJob(overrides: Partial<Parameters<RunJobAccess["runJob"]>[0]> = {}) {
  return {
    id: "job-1",
    type: "GENERATE_SHIPPING_LABEL",
    payload: { orderId: "order-1" },
    attempts: 0,
    maxAttempts: 5,
    ...overrides,
  };
}

describe("JobWorker", () => {
  it("job exitoso → handler ejecutado con el payload y status DONE", async () => {
    const prisma = mockPrisma();
    const handler = vi.fn<JobHandler>().mockResolvedValue(undefined);
    const worker = makeWorker(prisma, (w) => w.register("GENERATE_SHIPPING_LABEL", handler));

    await invokeRunJob(worker, makeJob());

    expect(handler).toHaveBeenCalledWith({ orderId: "order-1" });
    expect(prisma.backgroundJob.update).toHaveBeenCalledWith({
      where: { id: "job-1" },
      data: { status: "DONE" },
    });
  });

  it("fallo con reintentos restantes → PENDING, attempts++, nextAttemptAt en el futuro", async () => {
    const prisma = mockPrisma();
    const warnSpy = vi.spyOn(logger, "warn").mockImplementation(() => {});
    const worker = makeWorker(prisma, (w) =>
      w.register("GENERATE_SHIPPING_LABEL", async () => {
        throw new Error("envia timeout");
      }),
    );
    const before = Date.now();

    await invokeRunJob(worker, makeJob({ attempts: 2, maxAttempts: 5 }));

    expect(prisma.backgroundJob.update).toHaveBeenCalledTimes(1);
    const updateArg = prisma.backgroundJob.update.mock.calls[0][0];
    expect(updateArg.data.status).toBe("PENDING");
    expect(updateArg.data.attempts).toBe(3);
    expect(updateArg.data.lastError).toBe("envia timeout");

    // Backoff exponencial para el intento 3: min(60s * 2^3, 1h) = 480s
    const nextAttemptAt = updateArg.data.nextAttemptAt as Date;
    const expectedDelayMs = Math.min(60_000 * 2 ** 3, 60 * 60_000);
    expect(nextAttemptAt.getTime()).toBeGreaterThanOrEqual(before + expectedDelayMs - 1000);
    expect(nextAttemptAt.getTime()).toBeLessThan(Date.now() + expectedDelayMs + 1000);

    expect(warnSpy).toHaveBeenCalledWith(
      expect.objectContaining({ jobId: "job-1", type: "GENERATE_SHIPPING_LABEL", attempt: 3 }),
      "[JobWorker] Job falló, reintentará",
    );

    warnSpy.mockRestore();
  });

  it("fallo agotando maxAttempts → status FAILED y logger.error", async () => {
    const prisma = mockPrisma();
    const errorSpy = vi.spyOn(logger, "error").mockImplementation(() => {});
    const worker = makeWorker(prisma, (w) =>
      w.register("GENERATE_SHIPPING_LABEL", async () => {
        throw new Error("fallo definitivo");
      }),
    );

    await invokeRunJob(worker, makeJob({ attempts: 4, maxAttempts: 5 }));

    expect(prisma.backgroundJob.update).toHaveBeenCalledTimes(1);
    const updateArg = prisma.backgroundJob.update.mock.calls[0][0];
    expect(updateArg.data.status).toBe("FAILED");
    expect(updateArg.data.attempts).toBe(5);
    expect(updateArg.data.lastError).toBe("fallo definitivo");

    expect(errorSpy).toHaveBeenCalledWith(
      expect.objectContaining({ jobId: "job-1", type: "GENERATE_SHIPPING_LABEL" }),
      "[JobWorker] Job agotó reintentos — requiere intervención manual",
    );

    errorSpy.mockRestore();
  });

  it("sin handler registrado para el tipo → se trata como fallo reintentable", async () => {
    const prisma = mockPrisma();
    const warnSpy = vi.spyOn(logger, "warn").mockImplementation(() => {});
    const worker = makeWorker(prisma);

    await invokeRunJob(worker, makeJob({ type: "UNKNOWN_TYPE" }));

    const updateArg = prisma.backgroundJob.update.mock.calls[0][0];
    expect(updateArg.data.status).toBe("PENDING");
    expect(updateArg.data.lastError).toContain("Sin handler registrado para tipo 'UNKNOWN_TYPE'");

    warnSpy.mockRestore();
  });

  // TODO: claimBatch necesita test de integración contra una DB de test real —
  // usa SQL crudo con FOR UPDATE SKIP LOCKED y no se mockea (regla del proyecto:
  // las queries de repositories/Prisma real se validan contra DB, no con mocks).
});
