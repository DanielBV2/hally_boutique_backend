import type { Request, Response } from "express";
import type { PaymentService } from "./payment.service.js";
import type { ApiResponse } from "../../shared/types/api-response.js";
import type { CreateCheckoutParams } from "./payment.schema.js";

export class PaymentController {
  constructor(private readonly service: PaymentService) {}

  checkout = async (req: Request, res: Response) => {
    const { orderId } = req.params as CreateCheckoutParams;
    const result = await this.service.createCheckout(req.user!.id, orderId);

    const body: ApiResponse<typeof result> = {
      success: true,
      data: result,
    };
    res.status(200).json(body);
  };

  webhook = async (req: Request, res: Response) => {
    await this.service.processWebhookEvent(req.body, String(req.id ?? "")); // eslint-disable-line @typescript-eslint/no-base-to-string

    const body: ApiResponse<null> = {
      success: true,
      data: null,
    };
    res.status(200).json(body);
  };
}
