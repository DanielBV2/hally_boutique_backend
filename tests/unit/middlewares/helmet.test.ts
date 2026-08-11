import { describe, it, expect } from "vitest";
import express from "express";
import helmet from "helmet";
import request from "supertest";

describe("helmet", () => {
  it("agrega headers de seguridad a las respuestas", async () => {
    const app = express();
    app.use(helmet());
    app.get("/", (_req, res) => res.json({ ok: true }));

    const res = await request(app).get("/");

    expect(res.headers["content-security-policy"]).toBeDefined();
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
    expect(res.headers["x-frame-options"]).toBe("SAMEORIGIN");
    expect(res.headers["referrer-policy"]).toBeDefined();
    expect(res.headers["x-dns-prefetch-control"]).toBe("off");
    expect(res.headers["strict-transport-security"]).toBeDefined();
  });
});
