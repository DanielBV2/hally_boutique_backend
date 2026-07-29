import type { ShippingRateOption } from "./shippingClient.js";

const ZONE_MAP: Record<string, string> = {
  Bolívar: "LOCAL",
  Atlántico: "REGIONAL",
  Magdalena: "REGIONAL",
  Sucre: "REGIONAL",
  Córdoba: "REGIONAL",
  Cesar: "REGIONAL",
  "La Guajira": "REGIONAL",
  Amazonas: "ESPECIAL",
  Vaupés: "ESPECIAL",
  Vichada: "ESPECIAL",
  Guainía: "ESPECIAL",
  Chocó: "ESPECIAL",
  "San Andrés y Providencia": "ESPECIAL",
};

const ZONE_RATES: Record<
  string,
  { base: number; perKg: number }
> = {
  LOCAL: { base: 8000, perKg: 1500 },
  REGIONAL: { base: 12000, perKg: 2000 },
  NACIONAL: { base: 18000, perKg: 2500 },
  ESPECIAL: { base: 35000, perKg: 4000 },
};

export function getStaticShippingEstimate(
  department: string,
  totalWeightGrams: number,
): ShippingRateOption {
  const zone = ZONE_MAP[department] ?? "NACIONAL";
  const { base, perKg } = ZONE_RATES[zone]!;
  const totalKg = totalWeightGrams / 1000;
  const additionalKg = Math.max(0, totalKg - 2);
  const price = base + Math.round(additionalKg * perKg);

  return {
    carrier: "estimado",
    service: "static",
    serviceDescription: "Estimado (tarifas en tiempo real no disponibles)",
    deliveryEstimate: "3-7 días hábiles",
    totalPrice: price,
    currency: "COP",
  };
}
