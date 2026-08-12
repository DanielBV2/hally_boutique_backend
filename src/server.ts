import { app } from "./app.js";
import { env } from "./config/env.js";
import { prisma } from "./config/prisma.js";
import { jobQueue } from "./shared/utils/jobQueue.js";
import { createGracefulShutdown } from "./shared/utils/gracefulShutdown.js";

async function main(): Promise<void> {
  await prisma.$connect();
  console.log("Database connected");

  const server = app.listen(env.PORT, () => {
    console.log(`Server running on http://localhost:${env.PORT}`);
  });

  const shutdown = createGracefulShutdown({
    closeServer: () =>
      new Promise<void>((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      }),
    drainJobs: () => jobQueue.drain(),
    disconnectDb: () => prisma.$disconnect(),
  });

  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
}

main().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});
