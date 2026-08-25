import { describe, it, expect, vi, afterEach } from "vitest";
import { voidWompiTransaction } from "../../../src/shared/utils/wompiClient.js";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("voidWompiTransaction", () => {
  it("retorna success true cuando Wompi aprueba el void", async () => {
    const fetchMock = vi.fn(
      async () => new Response(JSON.stringify({ status: "VOIDED" }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await voidWompiTransaction("txn-1", "prv_test");

    expect(result.success).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://sandbox.wompi.co/v1/transactions/txn-1/void",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer prv_test",
          "Content-Type": "application/json",
        }),
      }),
    );
  });

  it("retorna success false con el error cuando Wompi responde 4xx", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () => new Response(JSON.stringify({ message: "no encontrada" }), { status: 404 }),
      ),
    );

    const result = await voidWompiTransaction("txn-1", "prv_test");

    expect(result.success).toBe(false);
    expect(result.error).toContain("no encontrada");
  });

  it("retorna success false cuando el fetch falla tras agotar reintentos", async () => {
    const fetchMock = vi.fn(async () => {
      throw new TypeError("network down");
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await voidWompiTransaction("txn-1", "prv_test");

    expect(result.success).toBe(false);
    expect(result.error).toBe("Request failed after 3 attempts: network down");
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});
