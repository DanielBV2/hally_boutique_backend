import type { Request, Response } from "express";
import type { OrderService } from "./order.service.js";
import type { ApiResponse } from "../../shared/types/api-response.js";
import type { CreateOrderInput, ListOrdersQuery } from "./order.schema.js";

export class OrderController {
  constructor(private readonly service: OrderService) {}

  list = async (req: Request, res: Response) => {
    const query = req.query as unknown as ListOrdersQuery;
    const result = await this.service.listMyOrders(req.user!.id, query);

    const body: ApiResponse<typeof result.items> = {
      success: true,
      data: result.items,
    };
    res.status(200).json(body);
  };

  getById = async (req: Request, res: Response) => {
    const { id } = req.params as { id: string };
    const order = await this.service.getMyOrderById(req.user!.id, id);

    const body: ApiResponse<typeof order> = {
      success: true,
      data: order,
    };
    res.status(200).json(body);
  };

  create = async (req: Request, res: Response) => {
    const data = req.body as CreateOrderInput;
    const order = await this.service.createOrderFromCart(req.user!.id, data);

    const body: ApiResponse<typeof order> = {
      success: true,
      data: order,
    };
    res.status(201).json(body);
  };
}
