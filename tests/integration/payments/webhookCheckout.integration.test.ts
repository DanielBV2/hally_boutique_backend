import { describe, it, expect, beforeEach } from "vitest";
import { createHash, randomUUID } from "node:crypto";
import request from "supertest";
import { app } from "../../../src/app.js";
import { env } from "../../../src/config/env.js";
import { prisma } from "../prisma.js";

// Replica EXACTA del algoritmo de verifyEventChecksum (src/shared/utils/wompiSignature.ts)
// para construir un checksum válido — no se asume el formato, se copia del código real.
function buildChecksum(
  transaction: Record<string, unknown>,
  properties: string[],
  timestamp: number,
  eventsSecret: string,
): string {
  const values = properties.map((prop) => {
    const path = prop.replace("transaction.", "");
    return String(transaction[path]);
  });
  const raw = values.join("") + timestamp + eventsSecret;
  return createHash("sha256").update(raw).digest("hex");
}

const WOMPI_EVENTS_SECRET = env.WOMPI_EVENTS_SECRET;

interface SeededOrder {
  orderId: string;
  reference: string;
  variantId: string;
  stock: number;
  quantity: number;
}

async function seedApprovedPendingOrder(stock = 10, quantity = 2): Promise<SeededOrder> {
  const category = await prisma.category.create({
    data: { name: `Categoría ${Date.now()}`, slug: `categoria-${Date.now()}` },
  });
  const product = await prisma.product.create({
    data: {
      name: "Vestido Test",
      slug: `vestido-${Date.now()}`,
      description: "desc",
      basePrice: 100000,
      weightGrams: 300,
      categoryId: category.id,
    },
  });
  const variant = await prisma.variant.create({
    data: {
      productId: product.id,
      size: "M",
      color: "Azul",
      sku: `SKU-${Date.now()}`,
      stock,
    },
  });
  const user = await prisma.user.create({
    data: {
      email: `webhook-${Date.now()}@test.co`,
      passwordHash: "nohash",
      firstName: "Webhook",
      lastName: "Test",
    },
  });
  const address = await prisma.address.create({
    data: {
      userId: user.id,
      fullName: "Webhook Test",
      phone: "+573000000000",
      line1: "Calle 1 # 123",
      city: "Bogota",
      state: "BOL",
      isDefault: true,
    },
  });
  const reference = `ref-${randomUUID()}`;
  const subtotal = Number(product.basePrice) * quantity;
  const taxAmount = Math.round(subtotal * 0.19);
  const order = await prisma.order.create({
    data: {
      userId: user.id,
      status: "PENDING",
      subtotal,
      taxAmount,
      shippingAmount: 6000,
      total: subtotal + taxAmount + 6000,
      shippingCarrier: "interRapidisimo",
      shippingService: "standard",
      shippingStatus: "PENDING",
      shippingAddressId: address.id,
      shippingFullName: address.fullName,
      shippingPhone: address.phone,
      shippingLine1: address.line1,
      shippingLine2: null,
      shippingCity: address.city,
      shippingState: address.state,
      shippingCountry: "CO",
      shippingPostalCode: null,
      idempotencyKey: reference,
      items: {
        create: [
          {
            variantId: variant.id,
            productName: product.name,
            size: "M",
            color: "Azul",
            unitPrice: Number(product.basePrice),
            quantity,
            weightGrams: product.weightGrams,
          },
        ],
      },
    },
  });
  await prisma.payment.create({
    data: {
      orderId: order.id,
      provider: "WOMPI",
      status: "PENDING",
      providerReferenceId: reference,
      amount: Number(order.total),
      currency: "COP",
    },
  });

  return { orderId: order.id, reference, variantId: variant.id, stock, quantity };
}

function buildApprovedWebhook(reference: string, amountInCents: number, transactionId: string) {
  const transaction = {
    id: transactionId,
    status: "APPROVED",
    amount_in_cents: amountInCents,
    reference,
  };
  const properties = [
    "transaction.id",
    "transaction.status",
    "transaction.amount_in_cents",
    "transaction.reference",
  ];
  const timestamp = Math.floor(Date.now() / 1000);
  const checksum = buildChecksum(transaction, properties, timestamp, WOMPI_EVENTS_SECRET);
  return {
    event: "transaction.updated",
    data: { transaction },
    signature: { checksum, properties },
    timestamp,
  };
}

describe("Webhook Wompi — flujo de compra completo (integración)", () => {
  beforeEach(async () => {
    await prisma.backgroundJob.deleteMany({});
  });

  it("pago APPROVED → Order PAID, stock descontado, job de guía de envío encolado", async () => {
    const seeded = await seedApprovedPendingOrder();
    const amountInCents = Math.round(
      seeded.quantity * 100000 + 100000 * 0.19 * seeded.quantity + 6000,
    );
    const payload = buildApprovedWebhook(seeded.reference, amountInCents, `txn-${Date.now()}`);

    const res = await request(app).post("/api/payments/webhook").send(payload);
    expect(res.status).toBe(200);

    // Orden queda PAID
    const order = await prisma.order.findUnique({ where: { id: seeded.orderId } });
    expect(order?.status).toBe("PAID");

    // Stock descontada correctamente
    const variant = await prisma.variant.findUnique({ where: { id: seeded.variantId } });
    expect(variant?.stock).toBe(seeded.stock - seeded.quantity);

    // Se creó el job de guía de envío (outbox) con el uniqueKey correcto
    const job = await prisma.backgroundJob.findUnique({
      where: { uniqueKey: `shipping-label:${seeded.orderId}` },
    });
    expect(job).not.toBeNull();
    expect(job?.type).toBe("GENERATE_SHIPPING_LABEL");
    expect(job?.status).toBe("PENDING");
    expect(job?.payload).toEqual({ orderId: seeded.orderId });
  });

  it("reintento de Wompi (mismo webhook 2 veces) no duplica ni transición ni jobs", async () => {
    const seeded = await seedApprovedPendingOrder();
    const amountInCents = Math.round(
      seeded.quantity * 100000 + 100000 * 0.19 * seeded.quantity + 6000,
    );
    const transactionId = `txn-repeat-${Date.now()}`;
    const payload = buildApprovedWebhook(seeded.reference, amountInCents, transactionId);

    const first = await request(app).post("/api/payments/webhook").send(payload);
    expect(first.status).toBe(200);

    // Reenvío (idempotencia): el estado ya no es PENDING, se ignora
    const second = await request(app).post("/api/payments/webhook").send(payload);
    expect(second.status).toBe(200);

    // Orden sigue PAID (no se duplicó ni se revirtió)
    const order = await prisma.order.findUnique({ where: { id: seeded.orderId } });
    expect(order?.status).toBe("PAID");

    // Stock descontada UNA sola vez
    const variant = await prisma.variant.findUnique({ where: { id: seeded.variantId } });
    expect(variant?.stock).toBe(seeded.stock - seeded.quantity);

    // Un solo job de guía (uniqueKey evita duplicados)
    const jobs = await prisma.backgroundJob.findMany({
      where: { uniqueKey: `shipping-label:${seeded.orderId}` },
    });
    expect(jobs).toHaveLength(1);
    expect(jobs[0]?.status).toBe("PENDING");
  });
});
