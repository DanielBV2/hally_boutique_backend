import type { Request, Response } from "express";
import type { OrderService } from "./order.service.js";
import type { ApiResponse } from "../../shared/types/api-response.js";
import type {
  CreateOrderInput,
  ListOrdersQuery,
  ShippingSelectionInput,
  AdminOrdersQuery,
  UpdateOrderStatusInput,
} from "./order.schema.js";

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

  shippingQuote = async (req: Request, res: Response) => {
    const { orderId } = req.params as { orderId: string };
    const rates = await this.service.getShippingQuote(req.user!.id, orderId);

    const body: ApiResponse<typeof rates> = {
      success: true,
      data: rates,
    };
    res.status(200).json(body);
  };

  selectShipping = async (req: Request, res: Response) => {
    const { orderId } = req.params as { orderId: string };
    const data = req.body as ShippingSelectionInput;
    const order = await this.service.selectShipping(req.user!.id, orderId, data);

    const body: ApiResponse<typeof order> = {
      success: true,
      data: order,
    };
    res.status(200).json(body);
  };

  listAllAdmin = async (req: Request, res: Response) => {
    const query = req.query as unknown as AdminOrdersQuery;
    const filters = query.status ? { status: query.status } : {};
    const result = await this.service.listAllOrdersAdmin(filters, {
      page: query.page,
      limit: query.limit,
    });

    const body: ApiResponse<typeof result.items> = {
      success: true,
      data: result.items,
    };
    res.status(200).json(body);
  };

  getByIdAdmin = async (req: Request, res: Response) => {
    const { id } = req.params as { id: string };
    const order = await this.service.getOrderByIdAdmin(id);

    const body: ApiResponse<typeof order> = {
      success: true,
      data: order,
    };
    res.status(200).json(body);
  };

  updateStatusAdmin = async (req: Request, res: Response) => {
    const { id } = req.params as { id: string };
    const { status } = req.body as UpdateOrderStatusInput;
    const order = await this.service.updateOrderStatusAdmin(id, status);

    const body: ApiResponse<typeof order> = {
      success: true,
      data: order,
    };
    res.status(200).json(body);
  };
}
