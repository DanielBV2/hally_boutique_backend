import type { OrderRepository, OrderFilters } from "./order.repository.js";
import type { AddressRepository } from "../addresses/address.repository.js";
import type { CartRepository } from "../cart/cart.repository.js";
import type {
  OrderListItemDTO,
  OrderDetailDTO,
  OrderItemDTO,
  AdminOrderListItemDTO,
  AdminOrderDetailDTO,
} from "./order.dto.js";
import type {
  CreateOrderInput,
  ListOrdersQuery,
  ShippingSelectionInput,
} from "./order.schema.js";
import type { OrderWithItems, CreateOrderItemData, AdminOrderWithUser, Pagination } from "./order.types.js";
import type { OrderStatus } from "@prisma/client";
import {
  NotFoundError,
  ConflictError,
  ValidationError,
} from "../../shared/errors/app-error.js";
import { getAllShippingRates, type ShippingRateOption } from "../../shared/utils/shippingClient.js";
import { getStaticShippingEstimate } from "../../shared/utils/staticShippingRates.js";
import { toDepartmentCode } from "../../shared/utils/colombiaDepartmentCodes.js";
import { env } from "../../config/env.js";

export interface OrderService {
  listMyOrders(
    userId: string,
    query: ListOrdersQuery,
  ): Promise<{ items: OrderListItemDTO[]; total: number }>;
  getMyOrderById(userId: string, orderId: string): Promise<OrderDetailDTO>;
  createOrderFromCart(userId: string, data: CreateOrderInput): Promise<OrderDetailDTO>;
  getShippingQuote(userId: string, orderId: string): Promise<ShippingRateOption[]>;
  selectShipping(userId: string, orderId: string, data: ShippingSelectionInput): Promise<OrderDetailDTO>;
  listAllOrdersAdmin(
    filters: OrderFilters,
    pagination: Pagination,
  ): Promise<{ items: AdminOrderListItemDTO[]; total: number }>;
  getOrderByIdAdmin(orderId: string): Promise<AdminOrderDetailDTO>;
  updateOrderStatusAdmin(orderId: string, newStatus: OrderStatus): Promise<AdminOrderDetailDTO>;
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
    shippingFullName: order.shippingFullName,
    shippingPhone: order.shippingPhone,
    shippingLine1: order.shippingLine1,
    shippingLine2: order.shippingLine2,
    shippingCity: order.shippingCity,
    shippingState: order.shippingState,
    shippingCountry: order.shippingCountry,
    shippingPostalCode: order.shippingPostalCode,
    shippingCarrier: order.shippingCarrier ?? null,
    shippingService: order.shippingService ?? null,
    shippingTrackingNumber: order.shippingTrackingNumber ?? null,
    shippingLabelUrl: order.shippingLabelUrl ?? null,
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

function toAdminListItemDTO(order: AdminOrderWithUser): AdminOrderListItemDTO {
  return {
    ...toListItemDTO(order),
    customerEmail: order.user.email,
    customerName: `${order.user.firstName} ${order.user.lastName}`.trim(),
  };
}

function toAdminDetailDTO(order: AdminOrderWithUser): AdminOrderDetailDTO {
  return {
    ...toDetailDTO(order),
    customerEmail: order.user.email,
    customerName: `${order.user.firstName} ${order.user.lastName}`.trim(),
  };
}

export function buildPackagesFromOrder(order: OrderWithItems) {
  const totalWeightGrams = order.items.reduce(
    (sum, item) => sum + item.weightGrams * item.quantity,
    0,
  );
  const totalKg = totalWeightGrams / 1000;

  return [
    {
      weight: totalKg,
      weightUnit: "KG",
      lengthUnit: "CM",
      dimensions: { length: 30, width: 25, height: 10 },
      type: "box",
      amount: 1,
      content: "Ropa",
      declaredValue: Number(order.subtotal),
    },
  ];
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
        weightGrams: product.weightGrams,
      });
    }

    const subtotal = orderItems.reduce(
      (sum, item) => sum + item.unitPrice * item.quantity,
      0,
    );
    const taxAmount = Math.round(subtotal * env.TAX_RATE);
    const shippingAmount = 0;
    const total = subtotal + taxAmount + shippingAmount;

    const order = await this.orderRepository.createWithItems({
      userId,
      subtotal,
      taxAmount,
      total,
      shippingAddressId: data.addressId,
      shippingFullName: address.fullName,
      shippingPhone: address.phone,
      shippingLine1: address.line1,
      shippingLine2: address.line2,
      shippingCity: address.city,
      shippingState: address.state,
      shippingCountry: address.country,
      shippingPostalCode: address.postalCode,
      idempotencyKey: data.idempotencyKey,
      items: orderItems,
    });

    return toDetailDTO(order);
  }

  async getShippingQuote(userId: string, orderId: string): Promise<ShippingRateOption[]> {
    const order = await this.orderRepository.findByIdWithItems(orderId);
    if (!order || order.userId !== userId) {
      throw new NotFoundError("Order");
    }
    if (order.status !== "PENDING") {
      throw new ConflictError("Solo se pueden cotizar envíos para órdenes en estado PENDING");
    }

    const destination = {
      street: order.shippingLine1,
      city: order.shippingCity,
      state: toDepartmentCode(order.shippingState),
      country: order.shippingCountry,
      postalCode: order.shippingPostalCode ?? "",
    };

    const origin = {
      name: env.SHIPPING_ORIGIN_NAME,
      phone: env.SHIPPING_ORIGIN_PHONE,
      street: env.SHIPPING_ORIGIN_STREET,
      number: env.SHIPPING_ORIGIN_NUMBER,
      city: env.SHIPPING_ORIGIN_CITY,
      state: toDepartmentCode(env.SHIPPING_ORIGIN_STATE),
      country: env.SHIPPING_ORIGIN_COUNTRY,
      postalCode: env.SHIPPING_ORIGIN_POSTALCODE,
    };

    const totalWeightGrams = order.items.reduce(
      (sum, item) => sum + item.weightGrams * item.quantity,
      0,
    );

    const packages = buildPackagesFromOrder(order);

    const rates = await getAllShippingRates(origin, destination, packages);

    if (rates.length === 0) {
      return [getStaticShippingEstimate(order.shippingState, totalWeightGrams)];
    }

    return rates;
  }

  async selectShipping(
    userId: string,
    orderId: string,
    data: ShippingSelectionInput,
  ): Promise<OrderDetailDTO> {
    const order = await this.orderRepository.findByIdWithItems(orderId);
    if (!order || order.userId !== userId) {
      throw new NotFoundError("Order");
    }
    if (order.status !== "PENDING") {
      throw new ConflictError("Solo se pueden seleccionar envíos para órdenes en estado PENDING");
    }

    const destination = {
      street: order.shippingLine1,
      city: order.shippingCity,
      state: toDepartmentCode(order.shippingState),
      country: order.shippingCountry,
      postalCode: order.shippingPostalCode ?? "",
    };

    const origin = {
      name: env.SHIPPING_ORIGIN_NAME,
      phone: env.SHIPPING_ORIGIN_PHONE,
      street: env.SHIPPING_ORIGIN_STREET,
      city: env.SHIPPING_ORIGIN_CITY,
      state: toDepartmentCode(env.SHIPPING_ORIGIN_STATE),
      country: env.SHIPPING_ORIGIN_COUNTRY,
      postalCode: env.SHIPPING_ORIGIN_POSTALCODE,
    };

    const totalWeightGrams = order.items.reduce(
      (sum, item) => sum + item.weightGrams * item.quantity,
      0,
    );

    const packages = buildPackagesFromOrder(order);

    let rates = await getAllShippingRates(origin, destination, packages);
    if (rates.length === 0) {
      rates = [getStaticShippingEstimate(order.shippingState, totalWeightGrams)];
    }
    const match = rates.find(
      (r) => r.carrier === data.carrier && r.service === data.service,
    );

    if (!match) {
      throw new ConflictError(
        "La opción de envío seleccionada ya no está disponible, por favor cotiza de nuevo",
      );
    }

    const subtotal = Number(order.subtotal);
    const shippingAmount =
      subtotal >= env.FREE_SHIPPING_THRESHOLD ? 0 : match.totalPrice;
    const taxAmount = Number(order.taxAmount);
    const total = subtotal + taxAmount + shippingAmount;

    const updated = await this.orderRepository.updateShippingAndTotal(orderId, {
      shippingCarrier: data.carrier,
      shippingService: data.service,
      shippingAmount,
      total,
    });

    return toDetailDTO(updated);
  }

  async listAllOrdersAdmin(filters: OrderFilters, pagination: Pagination) {
    const { orders, total } = await this.orderRepository.findAllAdmin(filters, pagination);

    return {
      items: orders.map(toAdminListItemDTO),
      total,
    };
  }

  async getOrderByIdAdmin(orderId: string) {
    const order = await this.orderRepository.findByIdAdmin(orderId);
    if (!order) {
      throw new NotFoundError("Order");
    }
    return toAdminDetailDTO(order);
  }

  async updateOrderStatusAdmin(orderId: string, newStatus: OrderStatus) {
    const order = await this.orderRepository.findByIdAdmin(orderId);
    if (!order) {
      throw new NotFoundError("Order");
    }

    const progression = ["PAID", "PROCESSING", "SHIPPED", "DELIVERED"] as const;
    const currentIndex = progression.indexOf(order.status as (typeof progression)[number]);
    const nextIndex = progression.indexOf(newStatus as (typeof progression)[number]);

    if (currentIndex === -1 || nextIndex === -1 || nextIndex <= currentIndex) {
      throw new ConflictError(
        `Transición de estado inválida: no se puede pasar de ${order.status} a ${newStatus}`,
      );
    }

    await this.orderRepository.updateStatus(orderId, newStatus);

    const updated = await this.orderRepository.findByIdAdmin(orderId);
    if (!updated) {
      throw new NotFoundError("Order");
    }
    return toAdminDetailDTO(updated);
  }
}
