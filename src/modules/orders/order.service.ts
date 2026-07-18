import type { OrderRepository } from "./order.repository.js";
import type { AddressRepository } from "../addresses/address.repository.js";
import type { CartRepository } from "../cart/cart.repository.js";
import type { OrderListItemDTO, OrderDetailDTO, OrderItemDTO } from "./order.dto.js";
import type { CreateOrderInput, ListOrdersQuery } from "./order.schema.js";
import type { OrderWithItems, CreateOrderItemData } from "./order.types.js";
import {
  NotFoundError,
  ConflictError,
  ValidationError,
} from "../../shared/errors/app-error.js";

export interface OrderService {
  listMyOrders(
    userId: string,
    query: ListOrdersQuery,
  ): Promise<{ items: OrderListItemDTO[]; total: number }>;
  getMyOrderById(userId: string, orderId: string): Promise<OrderDetailDTO>;
  createOrderFromCart(userId: string, data: CreateOrderInput): Promise<OrderDetailDTO>;
}

function toItemDTO(item: OrderWithItems["items"][number]): OrderItemDTO {
  return {
    id: item.id,
    productName: item.productName,
    size: item.size,
    color: item.color,
    unitPrice: Number(item.unitPrice),
    quantity: item.quantity,
    lineTotal: Number(item.unitPrice) * item.quantity,
  };
}

function toDetailDTO(order: OrderWithItems): OrderDetailDTO {
  const items = order.items.map(toItemDTO);

  return {
    id: order.id,
    status: order.status,
    subtotal: Number(order.subtotal),
    taxAmount: Number(order.taxAmount),
    shippingAmount: Number(order.shippingAmount),
    total: Number(order.total),
    currency: order.currency,
    items,
    shippingAddressId: order.shippingAddressId,
    createdAt: order.createdAt,
  };
}

function toListItemDTO(order: OrderWithItems): OrderListItemDTO {
  return {
    id: order.id,
    status: order.status,
    total: Number(order.total),
    currency: order.currency,
    itemsCount: order.items.length,
    createdAt: order.createdAt,
  };
}

export class OrderServiceImpl implements OrderService {
  constructor(
    private readonly orderRepository: OrderRepository,
    private readonly cartRepository: CartRepository,
    private readonly addressRepository: AddressRepository,
  ) {}

  async listMyOrders(userId: string, query: ListOrdersQuery) {
    const { page, limit } = query;
    const { orders, total } = await this.orderRepository.findManyByUser(userId, {
      page,
      limit,
    });

    return {
      items: orders.map(toListItemDTO),
      total,
    };
  }

  async getMyOrderById(userId: string, orderId: string) {
    const order = await this.orderRepository.findByIdWithItems(orderId);
    if (!order || order.userId !== userId) {
      throw new NotFoundError("Order");
    }
    return toDetailDTO(order);
  }

  async createOrderFromCart(userId: string, data: CreateOrderInput) {
    const existing = await this.orderRepository.findByIdempotencyKey(
      userId,
      data.idempotencyKey,
    );
    if (existing) {
      return toDetailDTO(existing);
    }

    const address = await this.addressRepository.findById(data.addressId);
    if (!address || address.userId !== userId) {
      throw new NotFoundError("Address");
    }

    const cart = await this.cartRepository.findOrCreateByUserId(userId);

    if (cart.items.length === 0) {
      throw new ValidationError("El carrito está vacío");
    }

    const orderItems: CreateOrderItemData[] = [];
    for (const item of cart.items) {
      const variant = item.variant;
      const product = variant.product;

      if (item.quantity > variant.stock) {
        throw new ConflictError(
          `Stock insuficiente para "${product.name}" (talla ${variant.size}, ${variant.color}). Disponible: ${variant.stock}, solicitado: ${item.quantity}`,
        );
      }

      const unitPrice = Number(product.basePrice) + Number(variant.priceDelta);

      orderItems.push({
        variantId: variant.id,
        productName: product.name,
        size: variant.size,
        color: variant.color,
        unitPrice,
        quantity: item.quantity,
      });
    }

    const subtotal = orderItems.reduce(
      (sum, item) => sum + item.unitPrice * item.quantity,
      0,
    );
    const taxAmount = 0;
    const shippingAmount = 0;
    const total = subtotal + taxAmount + shippingAmount;

    const order = await this.orderRepository.createWithItems({
      userId,
      subtotal,
      total,
      shippingAddressId: data.addressId,
      idempotencyKey: data.idempotencyKey,
      items: orderItems,
    });

    return toDetailDTO(order);
  }
}
