import { describe, it, expect, vi } from "vitest";
import { JobWorker } from "../../../src/shared/utils/jobWorker.js";
import { prisma } from "../prisma.js";

// claimBatch() y runJob() son privados en la clase — se accede con el mismo
// patrón de cast que ya usa el unit test (tests/unit/shared/jobWorker.test.ts)
// para no ensuciar la clase de producción con modificadores solo por test.
interface WorkerAccess {
  claimBatch(): Promise<
    {
      id: string;
      type: string;
      payload: unknown;
      attempts: number;
      maxAttempts: number;
      status: string;
    }[]
  >;
  runJob(job: {
    id: string;
    type: string;
    payload: unknown;
    attempts: number;
    maxAttempts: number;
  }): Promise<void>;
}

describe("JobWorker.claimBatch (integración con Postgres real)", () => {
  it("reclama jobs PENDING → PROCESSING y al ejecutar el handler quedan DONE", async () => {
    await prisma.backgroundJob.createMany({
      data: [
        { type: "TEST_JOB", payload: { n: 1 }, uniqueKey: "claim-1" },
        { type: "TEST_JOB", payload: { n: 2 }, uniqueKey: "claim-2" },
      ],
    });

    const handler = vi.fn().mockResolvedValue(undefined);
    const worker = new JobWorker(prisma, { pollIntervalMs: 60_000, batchSize: 5 });
    worker.register("TEST_JOB", handler);

    const access = worker as unknown as WorkerAccess;
    const claimed = await access.claimBatch();

    expect(claimed).toHaveLength(2);
    expect(handler).not.toHaveBeenCalled();

    // claimBatch los marca PROCESSING en la DB real
    const processing = await prisma.backgroundJob.findMany({
      where: { uniqueKey: { in: ["claim-1", "claim-2"] } },
      orderBy: { uniqueKey: "asc" },
    });
    expect(processing.map((j) => j.status)).toEqual(["PROCESSING", "PROCESSING"]);

    // Ejecutar el handler (vía runJob) lleva cada job a DONE
    for (const job of claimed) {
      await access.runJob(job);
    }
    expect(handler).toHaveBeenCalledTimes(2);
    expect(handler).toHaveBeenCalledWith({ n: 1 });
    expect(handler).toHaveBeenCalledWith({ n: 2 });

    const done = await prisma.backgroundJob.findMany({
      where: { uniqueKey: { in: ["claim-1", "claim-2"] } },
    });
    expect(done.map((j) => j.status)).toEqual(["DONE", "DONE"]);
  });

  it("respeta nextAttemptAt: un job con nextAttemptAt en el futuro NO se reclama", async () => {
    await prisma.backgroundJob.create({
      data: {
        type: "TEST_JOB",
        payload: { n: 1 },
        uniqueKey: "future-1",
        nextAttemptAt: new Date(Date.now() + 60_000),
      },
    });

    const worker = new JobWorker(prisma, { pollIntervalMs: 60_000, batchSize: 5 });
    const claimed = await (worker as unknown as WorkerAccess).claimBatch();

    expect(claimed).toHaveLength(0);

    const job = await prisma.backgroundJob.findUnique({
      where: { uniqueKey: "future-1" },
    });
    expect(job?.status).toBe("PENDING");
  });

  it("respeta el batchSize: solo reclama esa cantidad aunque haya más pendientes", async () => {
    const jobs = Array.from({ length: 5 }, (_, i) => ({
      type: "TEST_JOB",
      payload: { n: i },
      uniqueKey: `batch-${i}`,
    }));
    await prisma.backgroundJob.createMany({ data: jobs });

    const worker = new JobWorker(prisma, { pollIntervalMs: 60_000, batchSize: 2 });
    const claimed = await (worker as unknown as WorkerAccess).claimBatch();

    // Se reclaman solo 2 (los más viejos por createdAt ASC)
    expect(claimed).toHaveLength(2);
    expect(claimed.map((j) => j.payload)).toEqual([{ n: 0 }, { n: 1 }]);

    const total = await prisma.backgroundJob.count({ where: { status: "PENDING" } });
    expect(total).toBe(3);
  });
});
