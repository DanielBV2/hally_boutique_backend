export function extractStreetNumber(line1: string): string {
  const match = line1.match(/\d+/);
  return match ? match[0] : "S/N";
}

export interface ShippingRateOption {
  carrier: string;
  service: string;
  serviceDescription: string;
  deliveryEstimate: string;
  totalPrice: number;
  currency: string;
}

export async function getShippingRate(
  carrier: string,
  origin: object,
  destination: object,
  packages: object[],
): Promise<ShippingRateOption[]> {
  try {
    const response = await fetch(`${process.env.ENVIA_BASE_URL}/ship/rate/`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.ENVIA_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        origin,
        destination,
        packages,
        shipment: { type: 1, carrier },
      }),
    });
    const json = (await response.json()) as { data?: Array<Record<string, unknown>> };
    if (!response.ok || !json.data) return [];
    return json.data.map((r) => ({
      carrier: String(r.carrier),
      service: String(r.service),
      serviceDescription: String(r.serviceDescription),
      deliveryEstimate: String(r.deliveryEstimate),
      totalPrice: parseFloat(String(r.totalPrice)),
      currency: String(r.currency),
    }));
  } catch (err) {
    return [];
  }
}

export interface ShippingLabelResult {
  success: boolean;
  trackingNumber?: string;
  labelUrl?: string;
  trackUrl?: string;
  error?: string;
}

export async function generateShippingLabel(
  origin: object,
  destination: object,
  packages: object[],
  carrier: string,
  service: string,
): Promise<ShippingLabelResult> {
  try {
    const response = await fetch(`${process.env.ENVIA_BASE_URL}/ship/generate/`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.ENVIA_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        origin,
        destination,
        packages,
        shipment: { type: 1, carrier, service },
        settings: {
          printFormat: "PDF",
          printSize: "STOCK_4X6",
          currency: "COP",
        },
      }),
    });
    const json = (await response.json()) as {
      meta?: string;
      data?: Array<Record<string, unknown>>;
    };
    if (!response.ok || json.meta === "error" || !json.data?.[0]) {
      return { success: false, error: JSON.stringify(json) };
    }
    const shipment = json.data[0];
    return {
      success: true,
      trackingNumber: String(shipment.trackingNumber),
      labelUrl: String(shipment.label),
      trackUrl: String(shipment.trackUrl),
    };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Unknown error",
    };
  }
}

export async function getAllShippingRates(
  origin: object,
  destination: object,
  packages: object[],
): Promise<ShippingRateOption[]> {
  const carriers = (process.env.SHIPPING_CARRIERS || "")
    .split(",")
    .map((c) => c.trim());
  const results = await Promise.all(
    carriers.map((carrier) =>
      getShippingRate(carrier, origin, destination, packages),
    ),
  );
  return results.flat().sort((a, b) => a.totalPrice - b.totalPrice);
}
