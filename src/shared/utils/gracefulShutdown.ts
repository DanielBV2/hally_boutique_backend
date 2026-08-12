export interface ShutdownTargets {
  closeServer(): Promise<void>;
  drainJobs(): Promise<void>;
  disconnectDb(): Promise<void>;
}

export interface ShutdownOptions {
  forceExitMs?: number;
  exit?: (code: number) => void;
  logger?: Pick<Console, "log" | "error">;
}

export function createGracefulShutdown(
  targets: ShutdownTargets,
  options: ShutdownOptions = {},
): (signal: string) => Promise<void> {
  const forceExitMs = options.forceExitMs ?? 10_000;
  const exit = options.exit ?? ((code: number) => process.exit(code));
  const logger = options.logger ?? console;

  let shuttingDown = false;

  return async function shutdown(signal: string): Promise<void> {
    if (shuttingDown) return;
    shuttingDown = true;

    logger.log(`[Shutdown] Recibido ${signal}, cerrando servidor...`);

    const forceTimer = setTimeout(() => {
      logger.error(`[Shutdown] Timeout de ${forceExitMs}ms superado, salida forzada.`);
      exit(1);
    }, forceExitMs);
    forceTimer.unref();

    try {
      await targets.closeServer();
      await targets.drainJobs();
      await targets.disconnectDb();
      clearTimeout(forceTimer);
      logger.log("[Shutdown] Apagado graceful completado.");
      exit(0);
    } catch (err) {
      clearTimeout(forceTimer);
      logger.error("[Shutdown] Error durante el apagado:", err);
      exit(1);
    }
  };
}
