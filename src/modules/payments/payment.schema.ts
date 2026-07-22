import { z } from "zod";

export const createCheckoutParamsSchema = z.object({
  orderId: z.string().uuid(),
});

export const wompiWebhookSchema = z.object({
  event: z.string(),
  data: z.object({
    transaction: z.object({
      id: z.string(),
      status: z.enum(["APPROVED", "DECLINED", "VOIDED", "ERROR", "PENDING"]),
      amount_in_cents: z.number(),
      reference: z.string(),
    }),
  }),
  signature: z.object({
    checksum: z.string(),
    properties: z.array(z.string()),
  }),
  timestamp: z.number(),
});

export type CreateCheckoutParams = z.infer<typeof createCheckoutParamsSchema>;
export type WompiWebhookInput = z.infer<typeof wompiWebhookSchema>;
