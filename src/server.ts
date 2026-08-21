import { app } from "./app.js";
import { env } from "./config/env.js";
import { prisma } from "./config/prisma.js";
import { container } from "./di/container.js";
import { createGracefulShutdown } from "./shared/utils/gracefulShutdown.js";
import { logger } from "./shared/utils/logger.js";

async function main(): Promise<void> {
  await prisma.$connect();
  logger.info("Database connected");

  container.jobWorker.start();
  logger.info(
    { pollIntervalMs: env.JOB_POLL_INTERVAL_MS, batchSize: env.JOB_BATCH_SIZE },
    "Job worker started",
  );

  const server = app.listen(env.PORT, () => {
    logger.info({ port: env.PORT }, "Server running");
  });

  const shutdown = createGracefulShutdown({
    closeServer: () =>
      new Promise<void>((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      }),
    drainJobs: () => container.jobWorker.stop(),
    disconnectDb: () => prisma.$disconnect(),
  });

  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
}

main().catch((err) => {
  logger.error({ err }, "Failed to start server");
  process.exit(1);
});
