import type { OrderRepository } from "../../modules/orders/order.repository.js";
import { buildPackagesFromOrder } from "../../modules/orders/order.service.js";
import { env } from "../../config/env.js";
import { logger } from "../../shared/utils/logger.js";
import { toDepartmentCode } from "../../shared/utils/colombiaDepartmentCodes.js";
import { extractStreetNumber, generateShippingLabel } from "../../shared/utils/shippingClient.js";

export interface GenerateShippingLabelPayload {
  orderId: string;
}

export function createGenerateShippingLabelHandler(deps: {
  orderRepository: OrderRepository;
}) {
  return async function generateShippingLabelHandler(rawPayload: unknown): Promise<void> {
    const payload = rawPayload as GenerateShippingLabelPayload;
    const order = await deps.orderRepository.findByIdWithItems(payload.orderId);
    if (!order) {
      throw new Error(`Order ${payload.orderId} no encontrada al procesar guía de envío`);
    }

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

    const destination = {
      name: order.shippingFullName,
      phone: order.shippingPhone,
      street: order.shippingLine1,
      number: extractStreetNumber(order.shippingLine1),
      city: order.shippingCity,
      state: toDepartmentCode(order.shippingState),
      country: order.shippingCountry,
      postalCode: order.shippingPostalCode ?? "",
    };

    const packages = buildPackagesFromOrder(order);

    const labelResult = await generateShippingLabel(
      origin,
      destination,
      packages,
      order.shippingCarrier ?? "",
      order.shippingService ?? "",
    );

    if (!labelResult.success) {
      // Escritura idempotente en cada intento fallido: si un reintento
      // posterior tiene éxito, updateShippingLabel lo sobrescribe con
      // LABEL_GENERATED; si el proceso muere antes del siguiente intento,
      // la DB ya refleja el fallo para intervención manual.
      await deps.orderRepository.markShippingLabelFailed(order.id);
      logger.error(
        { orderId: order.id, reason: labelResult.error },
        "GENERACIÓN DE GUÍA FALLIDA — Order. Generar manualmente desde el dashboard de Envia.com.",
      );
      throw new Error(
        `Generación de guía fallida para Order ${order.id}: ${labelResult.error ?? "sin detalle"}`,
      );
    }

    await deps.orderRepository.updateShippingLabel(order.id, {
      shippingTrackingNumber: labelResult.trackingNumber ?? "",
      shippingLabelUrl: labelResult.labelUrl ?? "",
    });
  };
}
