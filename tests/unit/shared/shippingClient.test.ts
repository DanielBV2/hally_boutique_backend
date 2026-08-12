import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  getShippingRate,
  generateShippingLabel,
} from "../../../src/shared/utils/shippingClient.js";
import { logger } from "../../../src/shared/utils/logger.js";

beforeEach(() => {
  process.env.ENVIA_BASE_URL = "https://api-test.envia.com";
  process.env.ENVIA_TOKEN = "test_token";
});

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.ENVIA_BASE_URL;
  delete process.env.ENVIA_TOKEN;
});

describe("getShippingRate", () => {
  it("mapea los datos de la respuesta de Envia", async () => {
    const payload = {
      data: [
        {
          carrier: "coordinadora",
          service: "express",
          serviceDescription: "Express nacional",
          deliveryEstimate: "2-3 días",
          totalPrice: 60000,
          currency: "COP",
        },
      ],
    };
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify(payload), { status: 200 })),
    );

    const rates = await getShippingRate("coordinadora", { a: 1 }, { b: 2 }, []);

    expect(rates).toEqual([
      {
        carrier: "coordinadora",
        service: "express",
        serviceDescription: "Express nacional",
        deliveryEstimate: "2-3 días",
        totalPrice: 60000,
        currency: "COP",
      },
    ]);
  });

  it("retorna [] y loguea warning si la API responde con error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({}), { status: 500 })),
    );
    const warnSpy = vi.spyOn(logger, "warn").mockImplementation(() => {});

    const rates = await getShippingRate("coordinadora", {}, {}, []);

    expect(rates).toEqual([]);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.objectContaining({ carrier: "coordinadora", status: 500 }),
      expect.stringContaining('getShippingRate (carrier "coordinadora")'),
    );

    warnSpy.mockRestore();
  });

  it("retorna [] y loguea warning si la petición falla (red/timeout)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("fetch failed");
      }),
    );
    const warnSpy = vi.spyOn(logger, "warn").mockImplementation(() => {});

    const rates = await getShippingRate("coordinadora", {}, {}, []);

    expect(rates).toEqual([]);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.objectContaining({ carrier: "coordinadora" }),
      expect.stringContaining('getShippingRate (carrier "coordinadora") falló'),
    );

    warnSpy.mockRestore();
  });
});

describe("generateShippingLabel", () => {
  it("mapea trackingNumber y url de la guía", async () => {
    const payload = {
      data: [
        {
          trackingNumber: "INTESBX679045",
          label: "https://envia.com/label/1",
          trackUrl: "https://envia.com/track/1",
        },
      ],
    };
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify(payload), { status: 200 })),
    );

    const result = await generateShippingLabel({}, {}, [], "coordinadora", "express");

    expect(result).toEqual({
      success: true,
      trackingNumber: "INTESBX679045",
      labelUrl: "https://envia.com/label/1",
      trackUrl: "https://envia.com/track/1",
    });
  });

  it("retorna success false si meta es error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ meta: "error" }), { status: 200 })),
    );

    const result = await generateShippingLabel({}, {}, [], "coordinadora", "express");

    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });
});
