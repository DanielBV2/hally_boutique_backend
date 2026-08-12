import { describe, it, expect } from "vitest";
import { resolveLogLevel, logger } from "../../../src/shared/utils/logger.js";

describe("resolveLogLevel", () => {
  it("usa 'silent' en NODE_ENV=test", () => {
    expect(resolveLogLevel("test", undefined)).toBe("silent");
  });

  it("usa 'info' por defecto fuera de test", () => {
    expect(resolveLogLevel("development", undefined)).toBe("info");
    expect(resolveLogLevel("production", undefined)).toBe("info");
  });

  it("respeta LOG_LEVEL cuando se define", () => {
    expect(resolveLogLevel("production", "debug")).toBe("debug");
  });
});

describe("logger", () => {
  it("en entorno de test el singleton queda en silent", () => {
    expect(logger.level).toBe("silent");
  });
});
