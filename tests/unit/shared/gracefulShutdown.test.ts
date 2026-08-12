import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createGracefulShutdown, type ShutdownTargets } from "../../../src/shared/utils/gracefulShutdown.js";

function makeTargets(): ShutdownTargets {
  return {
    closeServer: vi.fn(async () => {}),
    drainJobs: vi.fn(async () => {}),
    disconnectDb: vi.fn(async () => {}),
  };
}

describe("createGracefulShutdown", () => {
  beforeEach(() => {
    vi.useRealTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("cierra en orden: server → jobs → DB, y sale con código 0", async () => {
    const calls: string[] = [];
    const targets = {
      closeServer: vi.fn(async () => {
        calls.push("close");
      }),
      drainJobs: vi.fn(async () => {
        calls.push("drain");
      }),
      disconnectDb: vi.fn(async () => {
        calls.push("disconnect");
      }),
    };
    const exit = vi.fn();
    const logger = { log: vi.fn(), error: vi.fn() };

    const shutdown = createGracefulShutdown(targets, { exit, logger });
    await shutdown("SIGTERM");

    expect(calls).toEqual(["close", "drain", "disconnect"]);
    expect(exit).toHaveBeenCalledWith(0);
    expect(logger.log).toHaveBeenCalledWith("[Shutdown] Apagado graceful completado.");
  });

  it("es idempotente: una segunda señal no repite el cierre", async () => {
    const targets = makeTargets();
    const exit = vi.fn();
    const shutdown = createGracefulShutdown(targets, { exit });

    await Promise.all([shutdown("SIGTERM"), shutdown("SIGINT")]);

    expect(targets.closeServer).toHaveBeenCalledOnce();
    expect(targets.drainJobs).toHaveBeenCalledOnce();
    expect(targets.disconnectDb).toHaveBeenCalledOnce();
    expect(exit).toHaveBeenCalledOnce();
  });

  it("si una fase falla, sale con código 1 y no continúa con las siguientes", async () => {
    const targets = {
      closeServer: vi.fn(async () => {}),
      drainJobs: vi.fn(async () => {
        throw new Error("boom");
      }),
      disconnectDb: vi.fn(async () => {}),
    };
    const exit = vi.fn();
    const logger = { log: vi.fn(), error: vi.fn() };

    const shutdown = createGracefulShutdown(targets, { exit, logger });
    await shutdown("SIGINT");

    expect(exit).toHaveBeenCalledWith(1);
    expect(targets.disconnectDb).not.toHaveBeenCalled();
    expect(logger.error).toHaveBeenCalledWith("[Shutdown] Error durante el apagado:", expect.any(Error));
  });

  it("fuerza la salida si se supera el timeout de apagado", async () => {
    vi.useFakeTimers();
    const targets = {
      closeServer: vi.fn(() => new Promise<void>(() => {})),
      drainJobs: vi.fn(async () => {}),
      disconnectDb: vi.fn(async () => {}),
    };
    const exit = vi.fn();
    const logger = { log: vi.fn(), error: vi.fn() };

    const shutdown = createGracefulShutdown(targets, { exit, logger, forceExitMs: 500 });
    void shutdown("SIGTERM");

    vi.advanceTimersByTime(500);

    expect(exit).toHaveBeenCalledWith(1);
    expect(logger.error).toHaveBeenCalledWith(
      "[Shutdown] Timeout de 500ms superado, salida forzada.",
    );
    vi.clearAllTimers();
  });
});
