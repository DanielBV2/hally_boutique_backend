import { describe, it, expect } from "vitest";
import express from "express";
import request from "supertest";
import {
  createLoginLimiter,
  createRegisterLimiter,
  createForgotPasswordLimiter,
  createApiLimiter,
} from "../../../src/middlewares/rateLimiter.js";

function makeApp(limiter: ReturnType<typeof createLoginLimiter>) {
  const app = express();
  app.use(limiter);
  app.get("/", (_req, res) => {
    res.json({ ok: true });
  });
  return app;
}

describe("rateLimiter", () => {
  it("permite peticiones por debajo del límite", async () => {
    const app = makeApp(createLoginLimiter());

    for (let i = 0; i < 10; i++) {
      const res = await request(app).get("/");
      expect(res.status).toBe(200);
    }
  });

  it("devuelve 429 con formato ApiResponse al superar el límite", async () => {
    const app = makeApp(createLoginLimiter());

    for (let i = 0; i < 10; i++) {
      await request(app).get("/");
    }

    const res = await request(app).get("/");

    expect(res.status).toBe(429);
    expect(res.body).toEqual({
      success: false,
      error: {
        code: "RATE_LIMITED",
        message: expect.stringContaining("inicio de sesión"),
      },
    });
  });

  it("cada instancia de limiter tiene su propio contador (sin fuga entre tests)", async () => {
    const agotado = makeApp(createLoginLimiter());
    const fresco = makeApp(createLoginLimiter());

    for (let i = 0; i < 10; i++) {
      await request(agotado).get("/");
    }

    const res = await request(fresco).get("/");
    expect(res.status).toBe(200);
  });

  it("forgotPasswordLimiter respeta su límite propio", async () => {
    const app = makeApp(createForgotPasswordLimiter());

    for (let i = 0; i < 5; i++) {
      await request(app).get("/");
    }

    const res = await request(app).get("/");
    expect(res.status).toBe(429);
    expect(res.body.error.code).toBe("RATE_LIMITED");
  });

  it("registerLimiter respeta su límite propio", async () => {
    const app = makeApp(createRegisterLimiter());

    for (let i = 0; i < 10; i++) {
      await request(app).get("/");
    }

    const res = await request(app).get("/");
    expect(res.status).toBe(429);
    expect(res.body.error.code).toBe("RATE_LIMITED");
  });

  it("apiLimiter no limita la ruta del webhook de pagos", async () => {
    const limiter = createApiLimiter();
    const app = express();
    app.use("/api", limiter);
    app.post("/api/payments/webhook", (_req, res) => res.json({ ok: true }));

    // Supera el límite de 300 para demostrar que la ruta se omite
    for (let i = 0; i < 305; i++) {
      const res = await request(app).post("/api/payments/webhook");
      expect(res.status).toBe(200);
    }
  });

  it("apiLimiter sí limita el resto de rutas /api", async () => {
    const app = makeApp(createApiLimiter());

    for (let i = 0; i < 300; i++) {
      await request(app).get("/");
    }

    const res = await request(app).get("/");
    expect(res.status).toBe(429);
  });
});
