import { logger } from "./logger.js";

export interface JobQueue {
  schedule(id: string, run: () => Promise<void>): void;
  drain(): Promise<void>;
}

interface JobEntry {
  id: string;
  run: () => Promise<void>;
}

export class InMemoryJobQueue implements JobQueue {
  private readonly jobs: JobEntry[] = [];
  private processing = false;

  schedule(id: string, run: () => Promise<void>): void {
    this.jobs.push({ id, run });
    void this.runLoop();
  }

  async drain(): Promise<void> {
    while (this.processing || this.jobs.length > 0) {
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
  }

  private async runLoop(): Promise<void> {
    if (this.processing) return;
    this.processing = true;
    try {
      while (this.jobs.length > 0) {
        const job = this.jobs.shift()!;
        try {
          await job.run();
        } catch (err) {
          logger.error({ jobId: job.id, err }, `[JobQueue] Job '${job.id}' failed`);
        }
      }
    } finally {
      this.processing = false;
    }
  }
}

export const jobQueue: JobQueue = new InMemoryJobQueue();
