import type { Request, Response } from "express";
import type { CartService } from "./cart.service.js";
import type { ApiResponse } from "../../shared/types/api-response.js";
import type { AddCartItemInput, UpdateCartItemInput } from "./cart.schema.js";

export class CartController {
  constructor(private readonly service: CartService) {}

  getCart = async (req: Request, res: Response) => {
    const userId = req.user!.id;
    const cart = await this.service.getCart(userId);

    const body: ApiResponse<typeof cart> = { success: true, data: cart };
    res.status(200).json(body);
  };

  addItem = async (req: Request, res: Response) => {
    const userId = req.user!.id;
    const data = req.body as AddCartItemInput;
    const cart = await this.service.addItem(userId, data);

    const body: ApiResponse<typeof cart> = { success: true, data: cart };
    res.status(200).json(body);
  };

  updateItemQuantity = async (req: Request, res: Response) => {
    const userId = req.user!.id;
    const { itemId } = req.params as { itemId: string };
    const data = req.body as UpdateCartItemInput;
    const cart = await this.service.updateItemQuantity(userId, itemId, data);

    const body: ApiResponse<typeof cart> = { success: true, data: cart };
    res.status(200).json(body);
  };

  removeItem = async (req: Request, res: Response) => {
    const userId = req.user!.id;
    const { itemId } = req.params as { itemId: string };
    const cart = await this.service.removeItem(userId, itemId);

    const body: ApiResponse<typeof cart> = { success: true, data: cart };
    res.status(200).json(body);
  };

  clearCart = async (req: Request, res: Response) => {
    const userId = req.user!.id;
    await this.service.clearCart(userId);

    const body: ApiResponse<null> = { success: true, data: null };
    res.status(200).json(body);
  };
}
