import { createHash } from "crypto";

export function generateIntegritySignature(
  reference: string,
  amountInCents: number,
  currency: string,
  integritySecret: string,
): string {
  const raw = `${reference}${amountInCents}${currency}${integritySecret}`;
  return createHash("sha256").update(raw).digest("hex");
}

export function verifyEventChecksum(
  event: {
    data: { transaction: Record<string, unknown> };
    signature: { checksum: string; properties: string[] };
    timestamp: number;
  },
  eventsSecret: string,
): boolean {
  const values = event.signature.properties.map((prop) => {
    const path = prop.replace("transaction.", "");
    return String(event.data.transaction[path]);
  });
  const raw = values.join("") + event.timestamp + eventsSecret;
  const computed = createHash("sha256").update(raw).digest("hex");
  return computed === event.signature.checksum;
}
