import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import jsonwebtoken from "jsonwebtoken";

vi.mock("../../../src/config/env.js", () => ({
  env: {
    JWT_SECRET: "test-jwt-secret",
    JWT_ISSUER: "hallyboutique-api",
    JWT_AUDIENCE: "hallyboutique-web",
  },
}));

import { authMiddleware } from "../../../src/middlewares/authMiddleware.js";
import { UnauthorizedError } from "../../../src/shared/errors/app-error.js";

function makeToken(payload: Record<string, unknown>, options: jsonwebtoken.SignOptions) {
  return jsonwebtoken.sign(payload, "test-jwt-secret", options);
}

function invoke(token?: string) {
  const req = {
    headers: token ? { authorization: `Bearer ${token}` } : {},
  } as any;
  const next = vi.fn();
  authMiddleware(req, {} as any, next);
  return { req, next };
}

describe("authMiddleware", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("acepta un token firmado con el issuer/audience correctos e inyecta req.user", () => {
    const token = makeToken(
      { email: "a@b.co", role: "CUSTOMER" },
      {
        subject: "user-1",
        issuer: "hallyboutique-api",
        audience: "hallyboutique-web",
        expiresIn: "5m",
      },
    );

    const { req, next } = invoke(token);

    expect(next).toHaveBeenCalledTimes(1);
    expect(next).toHaveBeenCalledWith();
    expect(req.user).toEqual({ id: "user-1", email: "a@b.co", role: "CUSTOMER" });
  });

  it("rechaza un token sin issuer ni audience", () => {
    const token = makeToken(
      { email: "a@b.co", role: "CUSTOMER" },
      { subject: "user-1", expiresIn: "5m" },
    );

    const { next } = invoke(token);

    expect(next).toHaveBeenCalledWith(expect.any(UnauthorizedError));
    expect(next.mock.calls[0][0].message).toBe("Invalid or expired token");
  });

  it("rechaza un token con issuer incorrecto", () => {
    const token = makeToken(
      { email: "a@b.co", role: "CUSTOMER" },
      {
        subject: "user-1",
        issuer: "evil-issuer",
        audience: "hallyboutique-web",
        expiresIn: "5m",
      },
    );

    const { next } = invoke(token);

    expect(next).toHaveBeenCalledWith(expect.any(UnauthorizedError));
  });

  it("rechaza un token con audience incorrecta", () => {
    const token = makeToken(
      { email: "a@b.co", role: "CUSTOMER" },
      {
        subject: "user-1",
        issuer: "hallyboutique-api",
        audience: "evil-audience",
        expiresIn: "5m",
      },
    );

    const { next } = invoke(token);

    expect(next).toHaveBeenCalledWith(expect.any(UnauthorizedError));
  });

  it("rechaza ausencia de header Authorization", () => {
    const { next } = invoke();

    expect(next).toHaveBeenCalledWith(expect.any(UnauthorizedError));
  });

  it("rechaza un header sin formato Bearer", () => {
    const req = { headers: { authorization: "Basic abc123" } } as any;
    const next = vi.fn();
    authMiddleware(req, {} as any, next);

    expect(next).toHaveBeenCalledWith(expect.any(UnauthorizedError));
  });
});
