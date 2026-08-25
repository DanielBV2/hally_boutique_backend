import { describe, it, expect, vi } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { PrismaJobQueue } from "../../../src/shared/utils/jobQueue.js";

function mockPrisma() {
  return {
    backgroundJob: {
      upsert: vi.fn().mockResolvedValue({}),
    },
  };
}

describe("PrismaJobQueue", () => {
  it("enqueue llama upsert con type/payload/uniqueKey correctos", async () => {
    const prisma = mockPrisma();
    const queue = new PrismaJobQueue(prisma as unknown as PrismaClient);

    await queue.enqueue({
      type: "GENERATE_SHIPPING_LABEL",
      payload: { orderId: "order-1" },
      uniqueKey: "shipping-label:order-1",
    });

    expect(prisma.backgroundJob.upsert).toHaveBeenCalledTimes(1);
    expect(prisma.backgroundJob.upsert).toHaveBeenCalledWith({
      where: { uniqueKey: "shipping-label:order-1" },
      create: {
        type: "GENERATE_SHIPPING_LABEL",
        payload: { orderId: "order-1" },
        uniqueKey: "shipping-label:order-1",
      },
      update: {},
    });
  });

  it("enqueue usa el cliente de transacción cuando se pasa tx (outbox atómico)", async () => {
    const prisma = mockPrisma();
    const queue = new PrismaJobQueue(prisma as unknown as PrismaClient);
    const tx = {
      backgroundJob: {
        upsert: vi.fn().mockResolvedValue({}),
      },
    };

    await queue.enqueue(
      {
        type: "GENERATE_SHIPPING_LABEL",
        payload: { orderId: "order-2" },
        uniqueKey: "shipping-label:order-2",
      },
      tx as never,
    );

    expect(tx.backgroundJob.upsert).toHaveBeenCalledTimes(1);
    expect(prisma.backgroundJob.upsert).not.toHaveBeenCalled();
  });

  it("job duplicado es no-op silencioso (update vacío, sin lanzar error)", async () => {
    const prisma = mockPrisma();
    const queue = new PrismaJobQueue(prisma as unknown as PrismaClient);

    await queue.enqueue({ type: "T", payload: {}, uniqueKey: "dup-key" });
    await queue.enqueue({ type: "T", payload: {}, uniqueKey: "dup-key" });

    expect(prisma.backgroundJob.upsert).toHaveBeenCalledTimes(2);
    for (const call of prisma.backgroundJob.upsert.mock.calls) {
      expect(call[0].update).toEqual({});
    }
  });
});
