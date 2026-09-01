import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const mocks = vi.hoisted(() => {
  const envKey: string | undefined = "re_test_real";
  const emailFrom = "test@resend.dev";
  const sendError: unknown = null;
  const sendFn = (() => {}) as (...args: unknown[]) => Promise<unknown>;
  const ResendCtor = vi.fn(function () {});

  return { envKey, emailFrom, sendError, sendFn, ResendCtor };
});

vi.mock("resend", () => {
  const { ResendCtor } = mocks;
  ResendCtor.mockImplementation(function () {
    return {
      emails: {
        send: (...args: unknown[]) => {
          void mocks.sendFn(...args);
          if (mocks.sendError) return Promise.resolve({ error: mocks.sendError });
          return Promise.resolve({ error: null });
        },
      },
    };
  });
  return { Resend: ResendCtor };
});

vi.mock("../../../src/config/env.js", () => ({
  env: {
    get RESEND_API_KEY() {
      return mocks.envKey;
    },
    get EMAIL_FROM() {
      return mocks.emailFrom;
    },
  },
}));

import { sendPasswordResetEmail } from "../../../src/shared/utils/emailClient.js";

beforeEach(() => {
  mocks.envKey = "re_test_real";
  mocks.emailFrom = "test@resend.dev";
  mocks.sendError = null;
  mocks.sendFn = vi.fn().mockResolvedValue({ error: null });
  mocks.ResendCtor.mockClear();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("sendPasswordResetEmail", () => {
  it("sin RESEND_API_KEY no instancia el cliente y devuelve error sin lanzar", async () => {
    mocks.envKey = undefined;

    const result = await sendPasswordResetEmail("user@example.com", "http://reset.url");

    expect(result).toEqual({
      success: false,
      error: "RESEND_API_KEY no configurada",
    });
    expect(mocks.ResendCtor).not.toHaveBeenCalled();
  });

  it("con RESEND_API_KEY configura envía el email con los parámetros correctos", async () => {
    const result = await sendPasswordResetEmail("user@example.com", "http://reset.url");

    expect(result).toEqual({ success: true });
    expect(mocks.ResendCtor).toHaveBeenCalledWith("re_test_real");
    expect(mocks.sendFn).toHaveBeenCalledWith(
      expect.objectContaining({
        from: "test@resend.dev",
        to: "user@example.com",
        subject: "Restablece tu contraseña — Hally Boutique",
      }),
    );
  });
});
