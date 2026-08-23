import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";

const { queryRawMock } = vi.hoisted(() => ({ queryRawMock: vi.fn() }));

vi.mock("../../src/config/prisma.js", () => ({
  prisma: {
    $queryRaw: queryRawMock,
  },
}));

import { app } from "../../src/app.js";

describe("/health", () => {
  beforeEach(() => {
    queryRawMock.mockReset();
  });

  it("responde 200 con status ok si la DB responde", async () => {
    queryRawMock.mockResolvedValue([{ "?column?": 1 }]);

    const res = await request(app).get("/health");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "ok", checks: { database: "ok" } });
    expect(queryRawMock).toHaveBeenCalledTimes(1);
  });

  it("responde 503 con status error si la DB falla", async () => {
    queryRawMock.mockRejectedValue(new Error("connection refused"));

    const res = await request(app).get("/health");

    expect(res.status).toBe(503);
    expect(res.body).toEqual({
      status: "error",
      checks: { database: "unreachable" },
    });
  });

  it("responde 503 si la DB no responde dentro del timeout (no cuelga la request)", async () => {
    queryRawMock.mockImplementation(() => new Promise(() => {}));

    const res = await request(app).get("/health");

    expect(res.status).toBe(503);
    expect(res.body).toEqual({
      status: "error",
      checks: { database: "unreachable" },
    });
  }, 10000);
});
