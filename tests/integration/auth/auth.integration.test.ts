import { describe, it, expect } from "vitest";
import request from "supertest";
import { app } from "../../../src/app.js";

describe("Auth — integración con Postgres real (sin mocks del stack)", () => {
  it("registro → login → token válido contra ruta protegida", async () => {
    const email = "integracion@test.co";
    const password = "ClaveSecreta123";

    // Registro
    const registerRes = await request(app).post("/api/auth/register").send({
      email,
      password,
      firstName: "Integración",
      lastName: "Test",
    });
    expect(registerRes.status).toBe(201);
    expect(registerRes.body.success).toBe(true);
    const { user, accessToken } = registerRes.body.data;
    expect(user.email).toBe(email);
    expect(user.role).toBe("CUSTOMER");
    expect(typeof accessToken).toBe("string");

    // Login con las mismas credenciales
    const loginRes = await request(app).post("/api/auth/login").send({
      email,
      password,
    });
    expect(loginRes.status).toBe(200);
    expect(loginRes.body.success).toBe(true);
    const loginToken = loginRes.body.data.accessToken;
    expect(loginToken).toBeTruthy();

    // El token funciona contra una ruta protegida (GET /api/auth/me)
    const meRes = await request(app)
      .get("/api/auth/me")
      .set("Authorization", `Bearer ${loginToken}`);
    expect(meRes.status).toBe(200);
    expect(meRes.body.success).toBe(true);
    expect(meRes.body.data.email).toBe(email);
    expect(meRes.body.data.firstName).toBe("Integración");
  });

  it("sin token → 401 en ruta protegida", async () => {
    const res = await request(app).get("/api/auth/me");
    expect(res.status).toBe(401);
  });
});
