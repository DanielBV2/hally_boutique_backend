import { describe, it, expect } from "vitest";
import {
  createVariantSchema,
  updateVariantSchema,
} from "../../../src/modules/products/variant.schema.js";

const baseInput = { size: "M", color: "Azul", stock: 5, priceDelta: 0 };

describe("createVariantSchema", () => {
  it("acepta un sku con al menos 3 caracteres", () => {
    const result = createVariantSchema.safeParse({
      ...baseInput,
      sku: "CAM-AZ-M",
    });
    expect(result.success).toBe(true);
  });

  it("trata el sku vacío como ausente (undefined)", () => {
    const result = createVariantSchema.safeParse({ ...baseInput, sku: "" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.sku).toBeUndefined();
    }
  });

  it("acepta la ausencia total del campo sku", () => {
    const result = createVariantSchema.safeParse(baseInput);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.sku).toBeUndefined();
    }
  });

  it("rechaza un sku de menos de 3 caracteres", () => {
    const result = createVariantSchema.safeParse({ ...baseInput, sku: "AB" });
    expect(result.success).toBe(false);
  });
});

describe("updateVariantSchema", () => {
  it("trata el sku vacío como ausente (undefined)", () => {
    const result = updateVariantSchema.safeParse({ sku: "" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.sku).toBeUndefined();
    }
  });
});
