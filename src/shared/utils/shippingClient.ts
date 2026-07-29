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
  } catch {
    return [];
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
