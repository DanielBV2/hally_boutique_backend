import type { PrismaClient } from "@prisma/client";
import { logger } from "./logger.js";

export type JobHandler = (payload: unknown) => Promise<void>;

interface ClaimedJob {
  id: string;
  type: string;
  payload: unknown;
  attempts: number;
  maxAttempts: number;
}

export class JobWorker {
  private readonly handlers = new Map<string, JobHandler>();
  private timer: NodeJS.Timeout | null = null;
  private running = false;
  private inFlight = 0;

  constructor(
    private readonly prisma: PrismaClient,
    private readonly options: { pollIntervalMs: number; batchSize: number },
  ) {}

  register(type: string, handler: JobHandler): void {
    this.handlers.set(type, handler);
  }

  start(): void {
    this.timer = setInterval(() => void this.tick(), this.options.pollIntervalMs);
    this.timer.unref();
  }

  async stop(): Promise<void> {
    if (this.timer) clearInterval(this.timer);
    while (this.inFlight > 0) {
      await new Promise((r) => setTimeout(r, 50));
    }
  }

  private async tick(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      const jobs = await this.claimBatch();
      await Promise.all(jobs.map((job) => this.runJob(job)));
    } catch (err) {
      logger.error({ err }, "[JobWorker] Error en ciclo de polling");
    } finally {
      this.running = false;
    }
  }

  // TODO: este método necesita test de integración contra una DB de test real —
  // usa SQL crudo con FOR UPDATE SKIP LOCKED y no se mockea (regla del proyecto:
  // las queries de repositories/Prisma real se validan contra DB, no con mocks).
  private async claimBatch(): Promise<ClaimedJob[]> {
    return this.prisma.$transaction(async (tx) => {
      const claimed = await tx.$queryRaw<{ id: string }[]>`
        SELECT id FROM background_jobs
        WHERE status = 'PENDING' AND "nextAttemptAt" <= now()
        ORDER BY "createdAt" ASC
        LIMIT ${this.options.batchSize}
        FOR UPDATE SKIP LOCKED
      `;
      if (claimed.length === 0) return [];

      const ids = claimed.map((c) => c.id);
      await tx.backgroundJob.updateMany({
        where: { id: { in: ids } },
        data: { status: "PROCESSING" },
      });
      return tx.backgroundJob.findMany({ where: { id: { in: ids } } });
    });
  }

  private async runJob(job: ClaimedJob): Promise<void> {
    this.inFlight++;
    const handler = this.handlers.get(job.type);
    try {
      if (!handler) throw new Error(`Sin handler registrado para tipo '${job.type}'`);
      await handler(job.payload);
      await this.prisma.backgroundJob.update({
        where: { id: job.id },
        data: { status: "DONE" },
      });
    } catch (err) {
      const attempts = job.attempts + 1;
      const failed = attempts >= job.maxAttempts;
      const delayMs = Math.min(60_000 * 2 ** attempts, 60 * 60_000);

      await this.prisma.backgroundJob.update({
        where: { id: job.id },
        data: {
          status: failed ? "FAILED" : "PENDING",
          attempts,
          nextAttemptAt: new Date(Date.now() + delayMs),
          lastError: err instanceof Error ? err.message : String(err),
        },
      });

      if (failed) {
        logger.error(
          { jobId: job.id, type: job.type, err },
          "[JobWorker] Job agotó reintentos — requiere intervención manual",
        );
      } else {
        logger.warn(
          { jobId: job.id, type: job.type, attempt: attempts, err },
          "[JobWorker] Job falló, reintentará",
        );
      }
    } finally {
      this.inFlight--;
    }
  }
}
