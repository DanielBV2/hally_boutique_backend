import { describe, it, expect, vi } from "vitest";
import {
  buildSkuBase,
  generateUniqueSku,
} from "../../../src/shared/utils/sku.js";

describe("buildSkuBase", () => {
  it("abrevia cada palabra del nombre con 3 letras y el color con 2", () => {
    expect(buildSkuBase("Camisa Oxford", "Azul", "M")).toBe("CAM-OXF-AZ-M");
  });

  it("normaliza mayúsculas y tildes", () => {
    expect(buildSkuBase("Camiseta Áncora", "Verde", "L")).toBe("CAM-ANC-VE-L");
  });

  it("usa la talla tal cual", () => {
    expect(buildSkuBase("Pantalón", "Negro", "XL")).toBe("PAN-NE-XL");
  });

  it("limita a 3 palabras del nombre", () => {
    expect(buildSkuBase("Camisa Oxford Manga Larga", "Rojo", "S")).toBe(
      "CAM-OXF-MAN-RO-S",
    );
  });
});

describe("generateUniqueSku", () => {
  it("devuelve la base si no existe", async () => {
    const checkExists = vi.fn().mockResolvedValue(false);

    const sku = await generateUniqueSku("Camisa Oxford", "Azul", "M", checkExists);

    expect(sku).toBe("CAM-OXF-AZ-M");
    expect(checkExists).toHaveBeenCalledWith("CAM-OXF-AZ-M");
  });

  it("agrega sufijo numérico sin guion cuando hay colisión", async () => {
    const checkExists = vi
      .fn()
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false);

    const sku = await generateUniqueSku("Camisa Oxford", "Azul", "M", checkExists);

    expect(sku).toBe("CAM-OXF-AZ-M2");
  });

  it("incrementa el contador mientras exista la colisión", async () => {
    const checkExists = vi
      .fn()
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false);

    const sku = await generateUniqueSku("Camisa Oxford", "Azul", "M", checkExists);

    expect(sku).toBe("CAM-OXF-AZ-M3");
  });
});
