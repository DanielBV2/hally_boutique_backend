import { describe, it, expect } from "vitest";
import express from "express";
import request from "supertest";
import { requestLogger } from "../../../src/shared/utils/logger.js";

function makeApp() {
  const app = express();
  app.use(requestLogger);
  app.get("/ping", (_req, res) => res.json({ ok: true }));
  return app;
}

describe("requestLogger", () => {
  it("genera y expone X-Request-Id en la respuesta", async () => {
    const res = await request(makeApp()).get("/ping").expect(200);
    expect(res.headers["x-request-id"]).toBeDefined();
  });

  it("preserva el X-Request-Id provisto por el cliente", async () => {
    const res = await request(makeApp()).get("/ping").set("x-request-id", "trace-42").expect(200);
    expect(res.headers["x-request-id"]).toBe("trace-42");
  });

  it("genera un request id distinto por cada request", async () => {
    const app = makeApp();
    const first = await request(app).get("/ping");
    const second = await request(app).get("/ping");
    expect(first.headers["x-request-id"]).not.toBe(second.headers["x-request-id"]);
  });
});
