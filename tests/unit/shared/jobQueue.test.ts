import { describe, it, expect, vi } from "vitest";
import { InMemoryJobQueue, jobQueue } from "../../../src/shared/utils/jobQueue.js";

describe("InMemoryJobQueue", () => {
  it("schedule no bloquea: el job se procesa en background", async () => {
    const queue = new InMemoryJobQueue();
    let completed = false;

    queue.schedule("job-1", async () => {
      await new Promise((r) => setTimeout(r, 30));
      completed = true;
    });

    expect(completed).toBe(false);
    await queue.drain();
    expect(completed).toBe(true);
  });

  it("procesa los jobs en orden FIFO", async () => {
    const queue = new InMemoryJobQueue();
    const order: string[] = [];

    queue.schedule("job-a", async () => {
      order.push("a");
    });
    queue.schedule("job-b", async () => {
      order.push("b");
    });

    await queue.drain();
    expect(order).toEqual(["a", "b"]);
  });

  it("no deja que un job que falla detenga a los siguientes", async () => {
    const queue = new InMemoryJobQueue();
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const ran: string[] = [];

    queue.schedule("job-fail", async () => {
      throw new Error("boom");
    });
    queue.schedule("job-ok", async () => {
      ran.push("ok");
    });

    await queue.drain();

    expect(ran).toEqual(["ok"]);
    expect(errorSpy).toHaveBeenCalledWith(
      "[JobQueue] Job 'job-fail' failed:",
      expect.any(Error),
    );
    errorSpy.mockRestore();
  });

  it("drain espera a que todos los jobs pendientes terminen", async () => {
    const queue = new InMemoryJobQueue();
    const results: number[] = [];

    for (let i = 0; i < 3; i++) {
      queue.schedule(`job-${i}`, async () => {
        await new Promise((r) => setTimeout(r, 10));
        results.push(i);
      });
    }

    await queue.drain();
    expect(results).toEqual([0, 1, 2]);
  });
});

describe("jobQueue singleton", () => {
  it("es una instancia compartida de InMemoryJobQueue", () => {
    expect(jobQueue).toBeInstanceOf(InMemoryJobQueue);
  });
});
