import type { Request, Response } from "express";
import type { VariantService } from "./variant.service.js";
import type { ApiResponse } from "../../shared/types/api-response.js";
import type { CreateVariantInput, UpdateVariantInput } from "./variant.schema.js";

export class VariantController {
  constructor(private readonly service: VariantService) {}

  listByProduct = async (req: Request, res: Response) => {
    const { productId } = req.params as { productId: string };
    const variants = await this.service.listByProduct(productId);

    const body: ApiResponse<typeof variants> = { success: true, data: variants };
    res.status(200).json(body);
  };

  create = async (req: Request, res: Response) => {
    const { productId } = req.params as { productId: string };
    const data = req.body as CreateVariantInput;
    const variant = await this.service.createVariant(productId, data);

    const body: ApiResponse<typeof variant> = { success: true, data: variant };
    res.status(201).json(body);
  };

  update = async (req: Request, res: Response) => {
    const { productId, variantId } = req.params as {
      productId: string;
      variantId: string;
    };
    const data = req.body as UpdateVariantInput;
    const variant = await this.service.updateVariant(productId, variantId, data);

    const body: ApiResponse<typeof variant> = { success: true, data: variant };
    res.status(200).json(body);
  };

  remove = async (req: Request, res: Response) => {
    const { productId, variantId } = req.params as {
      productId: string;
      variantId: string;
    };
    await this.service.deleteVariant(productId, variantId);

    const body: ApiResponse<null> = { success: true, data: null };
    res.status(200).json(body);
  };
}
