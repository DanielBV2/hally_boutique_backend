import type { PrismaClient, Payment, PaymentStatus, Order } from "@prisma/client";

type OrderWithItems = Order & { items: { id: string; variantId: string; quantity: number }[] };

export interface PaymentRepository {
  findByOrderId(orderId: string): Promise<Payment | null>;
  findByProviderReferenceId(ref: string): Promise<(Payment & { order: OrderWithItems }) | null>;
  create(data: {
    orderId: string;
    providerReferenceId: string;
    amount: number;
    currency: string;
  }): Promise<Payment>;
  updateStatus(id: string, status: PaymentStatus): Promise<Payment>;
}

export class PrismaPaymentRepository implements PaymentRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findByOrderId(orderId: string) {
    return this.prisma.payment.findUnique({ where: { orderId } });
  }

  async findByProviderReferenceId(ref: string) {
    return this.prisma.payment.findUnique({
      where: { providerReferenceId: ref },
      include: {
        order: {
          include: {
            items: { select: { id: true, variantId: true, quantity: true } },
          },
        },
      },
    });
  }

  async create(data: {
    orderId: string;
    providerReferenceId: string;
    amount: number;
    currency: string;
  }) {
    return this.prisma.payment.create({
      data: {
        orderId: data.orderId,
        provider: "WOMPI",
        status: "PENDING",
        providerReferenceId: data.providerReferenceId,
        amount: data.amount,
        currency: data.currency,
      },
    });
  }

  async updateStatus(id: string, status: PaymentStatus) {
    return this.prisma.payment.update({
      where: { id },
      data: { status },
    });
  }
}
