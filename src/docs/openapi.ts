import type { oas30 } from "openapi3-ts";

function successResponse(ref: string, description = "OK") {
  return {
    description,
    content: {
      "application/json": {
        schema: {
          type: "object",
          properties: {
            success: { type: "boolean", enum: [true] },
            data: { $ref: ref },
          },
          required: ["success", "data"],
        },
      },
    },
  };
}

function emptySuccessResponse(description = "OK") {
  return {
    description,
    content: {
      "application/json": {
        schema: {
          type: "object",
          properties: {
            success: { type: "boolean", enum: [true] },
            data: { type: "null", nullable: true },
          },
          required: ["success", "data"],
        },
      },
    },
  };
}

const errorResponse = {
  description: "Error",
  content: {
    "application/json": {
      schema: { $ref: "#/components/schemas/ErrorResponse" },
    },
  },
};

const bearerAuth: oas30.SecurityRequirementObject[] = [{ bearerAuth: [] }];
const noAuth: oas30.SecurityRequirementObject[] = [];

export const openapiDocument: oas30.OpenAPIObject = {
  openapi: "3.0.3",
  info: {
    title: "HallyBoutique API",
    version: "1.0.0",
    description:
      "API de e-commerce de ropa de Hally Boutique. Backend Node.js + Express + PostgreSQL (Prisma).\n\n" +
      "Autenticación: access token JWT (Bearer) de 15 min + refresh token opaco con rotación y detección de reuso. " +
      "Los endpoints protegidos requieren el header `Authorization: Bearer <accessToken>`.\n\n" +
      "Pagos: Wompi Web Checkout (ambiente Sandbox). El frontend arma el formulario con los datos de `POST /api/orders/:orderId/checkout`.",
  },
  servers: [{ url: "http://localhost:3000", description: "Local development" }],
  tags: [
    { name: "Auth", description: "Registro, login, sesión y recuperación de contraseña" },
    { name: "Products", description: "Catálogo de productos y variantes" },
    { name: "Categories", description: "Categorías del catálogo" },
    { name: "Cart", description: "Carrito de compras (requiere auth)" },
    { name: "Addresses", description: "Direcciones de envío del usuario (requiere auth)" },
    { name: "Orders", description: "Órdenes, envío y checkout (requiere auth)" },
    { name: "Payments", description: "Webhook de Wompi y utilidades de pago" },
    { name: "Metrics", description: "Dashboard de métricas (requiere ADMIN)" },
  ],
  security: bearerAuth,
  paths: {
    "/api/health": {
      get: {
        tags: ["Auth"],
        summary: "Health check",
        security: noAuth,
        responses: {
          "200": {
            description: "Servicio vivo",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: { status: { type: "string", enum: ["ok"] } },
                },
              },
            },
          },
        },
      },
    },

    "/api/auth/register": {
      post: {
        tags: ["Auth"],
        summary: "Registro de cliente",
        description: "Siempre crea un usuario con rol CUSTOMER.",
        security: noAuth,
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/RegisterRequest" },
            },
          },
        },
        responses: {
          "201": successResponse("#/components/schemas/AuthResponse", "Usuario creado"),
          "409": errorResponse,
          "400": errorResponse,
        },
      },
    },

    "/api/auth/login": {
      post: {
        tags: ["Auth"],
        summary: "Iniciar sesión",
        description: "Mensaje de error genérico tanto para email inexistente como contraseña incorrecta.",
        security: noAuth,
        requestBody: {
          required: true,
          content: {
            "application/json": { schema: { $ref: "#/components/schemas/LoginRequest" } },
          },
        },
        responses: {
          "200": successResponse("#/components/schemas/AuthResponse"),
          "401": errorResponse,
        },
      },
    },

    "/api/auth/refresh": {
      post: {
        tags: ["Auth"],
        summary: "Rotar refresh token",
        description:
          "Rotación en cada uso: el token usado se revoca y se emite uno nuevo. " +
          "Reusar un token ya revocado invalida TODA la sesión del usuario.",
        security: noAuth,
        requestBody: {
          required: true,
          content: {
            "application/json": { schema: { $ref: "#/components/schemas/RefreshRequest" } },
          },
        },
        responses: {
          "200": successResponse("#/components/schemas/RefreshResponse"),
          "401": errorResponse,
        },
      },
    },

    "/api/auth/logout": {
      post: {
        tags: ["Auth"],
        summary: "Cerrar sesión (idempotente)",
        security: noAuth,
        requestBody: {
          required: true,
          content: {
            "application/json": { schema: { $ref: "#/components/schemas/RefreshRequest" } },
          },
        },
        responses: {
          "200": emptySuccessResponse(),
        },
      },
    },

    "/api/auth/forgot-password": {
      post: {
        tags: ["Auth"],
        summary: "Solicitar reset de contraseña",
        description:
          "Siempre responde 200 con mensaje genérico (no revela si el email existe). " +
          "Envía el correo con el token de un solo uso (expira en 60 min).",
        security: noAuth,
        requestBody: {
          required: true,
          content: {
            "application/json": { schema: { $ref: "#/components/schemas/ForgotPasswordRequest" } },
          },
        },
        responses: {
          "200": emptySuccessResponse(),
        },
      },
    },

    "/api/auth/reset-password": {
      post: {
        tags: ["Auth"],
        summary: "Restablecer contraseña",
        description:
          "Token de un solo uso. Al resetear se revocan TODOS los refresh tokens del usuario " +
          "(cierre de sesión en todos los dispositivos). Mismo error para token inexistente/usado/expirado.",
        security: noAuth,
        requestBody: {
          required: true,
          content: {
            "application/json": { schema: { $ref: "#/components/schemas/ResetPasswordRequest" } },
          },
        },
        responses: {
          "200": emptySuccessResponse(),
          "401": errorResponse,
        },
      },
    },

    "/api/auth/me": {
      get: {
        tags: ["Auth"],
        summary: "Perfil del usuario autenticado",
        responses: {
          "200": successResponse("#/components/schemas/User"),
          "401": errorResponse,
        },
      },
      patch: {
        tags: ["Auth"],
        summary: "Actualizar perfil del usuario autenticado",
        description:
          "Actualiza nombre, apellido, email y/o teléfono. El email debe ser único; " +
          "si ya pertenece a otro usuario se responde 409.",
        requestBody: {
          required: true,
          content: {
            "application/json": { schema: { $ref: "#/components/schemas/UpdateProfileRequest" } },
          },
        },
        responses: {
          "200": successResponse("#/components/schemas/User", "Perfil actualizado"),
          "400": errorResponse,
          "401": errorResponse,
          "409": errorResponse,
        },
      },
    },

    "/api/auth/me/password": {
      patch: {
        tags: ["Auth"],
        summary: "Cambiar contraseña del usuario autenticado",
        description:
          "Verifica la contraseña actual, la reemplaza por la nueva y revoca " +
          "todas las sesiones (refresh tokens) del usuario.",
        requestBody: {
          required: true,
          content: {
            "application/json": { schema: { $ref: "#/components/schemas/ChangePasswordRequest" } },
          },
        },
        responses: {
          "200": emptySuccessResponse("Contraseña actualizada"),
          "400": errorResponse,
          "401": errorResponse,
          "404": errorResponse,
        },
      },
    },

    "/api/auth/admin/all": {
      get: {
        tags: ["Auth"],
        summary: "Listar usuarios (ADMIN)",
        parameters: [
          { name: "page", in: "query", schema: { type: "number", default: 1 } },
          { name: "limit", in: "query", schema: { type: "number", default: 20, maximum: 50 } },
          { name: "role", in: "query", schema: { type: "string", enum: ["CUSTOMER", "ADMIN"] } },
        ],
        responses: {
          "200": successResponse("#/components/schemas/AdminUserListResponse"),
          "401": errorResponse,
          "403": errorResponse,
        },
      },
    },

    "/api/products": {
      get: {
        tags: ["Products"],
        summary: "Listar productos del catálogo (público)",
        description: "Solo productos activos y variantes activas.",
        security: noAuth,
        parameters: [
          { name: "page", in: "query", schema: { type: "number", default: 1 } },
          { name: "limit", in: "query", schema: { type: "number", default: 20, maximum: 50 } },
          { name: "categoryId", in: "query", schema: { type: "string", format: "uuid" } },
          { name: "search", in: "query", schema: { type: "string" } },
          { name: "minPrice", in: "query", schema: { type: "number" } },
          { name: "maxPrice", in: "query", schema: { type: "number" } },
          {
            name: "sortBy",
            in: "query",
            schema: { type: "string", enum: ["createdAt", "basePrice", "name"], default: "createdAt" },
          },
          { name: "sortOrder", in: "query", schema: { type: "string", enum: ["asc", "desc"], default: "desc" } },
        ],
        responses: {
          "200": successResponse("#/components/schemas/ProductListResponse"),
          "400": errorResponse,
        },
      },
      post: {
        tags: ["Products"],
        summary: "Crear producto (ADMIN)",
        requestBody: {
          required: true,
          content: {
            "application/json": { schema: { $ref: "#/components/schemas/CreateProductRequest" } },
          },
        },
        responses: {
          "201": successResponse("#/components/schemas/ProductDetail", "Producto creado"),
          "400": errorResponse,
          "409": errorResponse,
          "403": errorResponse,
        },
      },
    },

    "/api/products/{slug}": {
      get: {
        tags: ["Products"],
        summary: "Detalle de producto por slug (público)",
        security: noAuth,
        parameters: [
          { name: "slug", in: "path", required: true, schema: { type: "string" } },
        ],
        responses: {
          "200": successResponse("#/components/schemas/ProductDetail"),
          "404": errorResponse,
        },
      },
    },

    "/api/products/admin/all": {
      get: {
        tags: ["Products"],
        summary: "Listar productos incluyendo inactivos (ADMIN)",
        parameters: [
          { name: "page", in: "query", schema: { type: "number", default: 1 } },
          { name: "limit", in: "query", schema: { type: "number", default: 20, maximum: 50 } },
          { name: "isActive", in: "query", schema: { type: "boolean" } },
          { name: "categoryId", in: "query", schema: { type: "string", format: "uuid" } },
          {
            name: "search",
            in: "query",
            description: "Busca por nombre de producto (insensible a mayúsculas).",
            schema: { type: "string" },
          },
        ],
        responses: {
          "200": successResponse("#/components/schemas/ProductListResponse"),
          "401": errorResponse,
          "403": errorResponse,
        },
      },
    },

    "/api/products/{id}": {
      patch: {
        tags: ["Products"],
        summary: "Actualizar producto (ADMIN)",
        parameters: [
          { name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } },
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": { schema: { $ref: "#/components/schemas/UpdateProductRequest" } },
          },
        },
        responses: {
          "200": successResponse("#/components/schemas/ProductDetail"),
          "404": errorResponse,
        },
      },
      delete: {
        tags: ["Products"],
        summary: "Soft delete de producto (ADMIN)",
        parameters: [
          { name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } },
        ],
        responses: {
          "200": emptySuccessResponse(),
          "404": errorResponse,
        },
      },
    },

    "/api/products/{id}/images": {
      post: {
        tags: ["Products"],
        summary: "Agregar imagen a producto (ADMIN)",
        parameters: [
          { name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } },
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": { schema: { $ref: "#/components/schemas/AddProductImageRequest" } },
          },
        },
        responses: {
          "201": emptySuccessResponse("Imagen agregada"),
          "404": errorResponse,
        },
      },
    },

    "/api/products/{id}/images/{imageId}": {
      delete: {
        tags: ["Products"],
        summary: "Quitar imagen de producto (ADMIN)",
        parameters: [
          { name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } },
          { name: "imageId", in: "path", required: true, schema: { type: "string", format: "uuid" } },
        ],
        responses: {
          "200": emptySuccessResponse(),
          "404": errorResponse,
        },
      },
    },

    "/api/products/{productId}/variants": {
      get: {
        tags: ["Products"],
        summary: "Listar variantes de un producto (ADMIN)",
        parameters: [
          { name: "productId", in: "path", required: true, schema: { type: "string", format: "uuid" } },
        ],
        responses: {
          "200": successResponse("#/components/schemas/VariantAdminListResponse"),
          "404": errorResponse,
        },
      },
      post: {
        tags: ["Products"],
        summary: "Crear variante (ADMIN)",
        parameters: [
          { name: "productId", in: "path", required: true, schema: { type: "string", format: "uuid" } },
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": { schema: { $ref: "#/components/schemas/CreateVariantRequest" } },
          },
        },
        responses: {
          "201": successResponse("#/components/schemas/VariantAdmin", "Variante creada"),
          "400": errorResponse,
        },
      },
    },

    "/api/products/{productId}/variants/{variantId}": {
      patch: {
        tags: ["Products"],
        summary: "Actualizar variante (ADMIN)",
        parameters: [
          { name: "productId", in: "path", required: true, schema: { type: "string", format: "uuid" } },
          { name: "variantId", in: "path", required: true, schema: { type: "string", format: "uuid" } },
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": { schema: { $ref: "#/components/schemas/UpdateVariantRequest" } },
          },
        },
        responses: {
          "200": successResponse("#/components/schemas/VariantAdmin"),
          "404": errorResponse,
        },
      },
      delete: {
        tags: ["Products"],
        summary: "Soft delete de variante (ADMIN)",
        parameters: [
          { name: "productId", in: "path", required: true, schema: { type: "string", format: "uuid" } },
          { name: "variantId", in: "path", required: true, schema: { type: "string", format: "uuid" } },
        ],
        responses: {
          "200": emptySuccessResponse(),
          "404": errorResponse,
        },
      },
    },

    "/api/categories": {
      get: {
        tags: ["Categories"],
        summary: "Listar categorías activas (público)",
        security: noAuth,
        responses: {
          "200": successResponse("#/components/schemas/CategoryListResponse"),
        },
      },
      post: {
        tags: ["Categories"],
        summary: "Crear categoría (ADMIN)",
        requestBody: {
          required: true,
          content: {
            "application/json": { schema: { $ref: "#/components/schemas/CreateCategoryRequest" } },
          },
        },
        responses: {
          "201": successResponse("#/components/schemas/Category", "Categoría creada"),
          "409": errorResponse,
        },
      },
    },

    "/api/categories/{slug}": {
      get: {
        tags: ["Categories"],
        summary: "Categoría por slug (público)",
        security: noAuth,
        parameters: [
          { name: "slug", in: "path", required: true, schema: { type: "string" } },
        ],
        responses: {
          "200": successResponse("#/components/schemas/Category"),
          "404": errorResponse,
        },
      },
    },

    "/api/categories/admin/all": {
      get: {
        tags: ["Categories"],
        summary: "Listar categorías incluyendo inactivas (ADMIN)",
        parameters: [
          { name: "page", in: "query", schema: { type: "number", default: 1 } },
          { name: "limit", in: "query", schema: { type: "number", default: 20, maximum: 50 } },
          { name: "isActive", in: "query", schema: { type: "boolean" } },
        ],
        responses: {
          "200": successResponse("#/components/schemas/CategoryAdminListResponse"),
        },
      },
    },

    "/api/categories/{id}": {
      patch: {
        tags: ["Categories"],
        summary: "Actualizar categoría (ADMIN)",
        parameters: [
          { name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } },
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": { schema: { $ref: "#/components/schemas/UpdateCategoryRequest" } },
          },
        },
        responses: {
          "200": successResponse("#/components/schemas/Category"),
          "404": errorResponse,
        },
      },
      delete: {
        tags: ["Categories"],
        summary: "Soft delete de categoría (ADMIN)",
        description: "409 si la categoría tiene productos activos asociados.",
        parameters: [
          { name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } },
        ],
        responses: {
          "200": emptySuccessResponse(),
          "404": errorResponse,
          "409": errorResponse,
        },
      },
    },

    "/api/cart": {
      get: {
        tags: ["Cart"],
        summary: "Obtener carrito",
        responses: {
          "200": successResponse("#/components/schemas/Cart"),
          "401": errorResponse,
        },
      },
      delete: {
        tags: ["Cart"],
        summary: "Vaciar carrito",
        responses: {
          "200": emptySuccessResponse(),
          "401": errorResponse,
        },
      },
    },

    "/api/cart/items": {
      post: {
        tags: ["Cart"],
        summary: "Agregar item al carrito",
        requestBody: {
          required: true,
          content: {
            "application/json": { schema: { $ref: "#/components/schemas/AddCartItemRequest" } },
          },
        },
        responses: {
          "201": successResponse("#/components/schemas/Cart", "Item agregado"),
          "404": errorResponse,
        },
      },
    },

    "/api/cart/items/{itemId}": {
      patch: {
        tags: ["Cart"],
        summary: "Actualizar cantidad de un item",
        parameters: [
          { name: "itemId", in: "path", required: true, schema: { type: "string", format: "uuid" } },
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": { schema: { $ref: "#/components/schemas/UpdateCartItemRequest" } },
          },
        },
        responses: {
          "200": successResponse("#/components/schemas/Cart"),
          "404": errorResponse,
        },
      },
      delete: {
        tags: ["Cart"],
        summary: "Quitar item del carrito",
        parameters: [
          { name: "itemId", in: "path", required: true, schema: { type: "string", format: "uuid" } },
        ],
        responses: {
          "200": emptySuccessResponse(),
          "404": errorResponse,
        },
      },
    },

    "/api/addresses": {
      get: {
        tags: ["Addresses"],
        summary: "Listar direcciones del usuario",
        responses: {
          "200": successResponse("#/components/schemas/AddressListResponse"),
          "401": errorResponse,
        },
      },
      post: {
        tags: ["Addresses"],
        summary: "Crear dirección",
        requestBody: {
          required: true,
          content: {
            "application/json": { schema: { $ref: "#/components/schemas/CreateAddressRequest" } },
          },
        },
        responses: {
          "201": successResponse("#/components/schemas/Address", "Dirección creada"),
          "400": errorResponse,
        },
      },
    },

    "/api/addresses/{id}": {
      patch: {
        tags: ["Addresses"],
        summary: "Actualizar dirección",
        parameters: [
          { name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } },
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": { schema: { $ref: "#/components/schemas/UpdateAddressRequest" } },
          },
        },
        responses: {
          "200": successResponse("#/components/schemas/Address"),
          "404": errorResponse,
        },
      },
      delete: {
        tags: ["Addresses"],
        summary: "Eliminar dirección",
        parameters: [
          { name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } },
        ],
        responses: {
          "200": emptySuccessResponse(),
          "404": errorResponse,
        },
      },
    },

    "/api/orders": {
      get: {
        tags: ["Orders"],
        summary: "Listar órdenes del usuario",
        parameters: [
          { name: "page", in: "query", schema: { type: "number", default: 1 } },
          { name: "limit", in: "query", schema: { type: "number", default: 20, maximum: 50 } },
        ],
        responses: {
          "200": successResponse("#/components/schemas/OrderListResponse"),
          "401": errorResponse,
        },
      },
      post: {
        tags: ["Orders"],
        summary: "Crear orden desde el carrito",
        description:
          "Snapshot de items y dirección. NO descuenta stock (eso ocurre en el webhook de pago aprobado). " +
          "idempotencyKey la genera el cliente; un reintento con la misma key devuelve la orden existente.",
        requestBody: {
          required: true,
          content: {
            "application/json": { schema: { $ref: "#/components/schemas/CreateOrderRequest" } },
          },
        },
        responses: {
          "201": successResponse("#/components/schemas/OrderDetail", "Orden creada"),
          "400": errorResponse,
          "409": errorResponse,
        },
      },
    },

    "/api/orders/{id}": {
      get: {
        tags: ["Orders"],
        summary: "Detalle de orden del usuario",
        description: "Fuente de verdad del estado tras el pago (no confiar en la redirect de Wompi).",
        parameters: [
          { name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } },
        ],
        responses: {
          "200": successResponse("#/components/schemas/OrderDetail"),
          "404": errorResponse,
        },
      },
    },

    "/api/orders/{orderId}/checkout": {
      post: {
        tags: ["Orders"],
        summary: "Generar checkout de Wompi",
        description:
          "Valida ownership y estado PENDING, calcula amount_in_cents y firma de integridad. " +
          "El frontend arma el formulario de Wompi Web Checkout con estos parámetros. " +
          "El estado real del pago se consulta con GET /api/orders/:id.",
        parameters: [
          { name: "orderId", in: "path", required: true, schema: { type: "string", format: "uuid" } },
        ],
        responses: {
          "200": successResponse("#/components/schemas/CheckoutParams"),
          "404": errorResponse,
          "409": errorResponse,
        },
      },
    },

    "/api/orders/{orderId}/shipping-quote": {
      post: {
        tags: ["Orders"],
        summary: "Cotizar envío",
        description: "Cotización en vivo vía Envia.com (carriers configurados).",
        parameters: [
          { name: "orderId", in: "path", required: true, schema: { type: "string", format: "uuid" } },
        ],
        responses: {
          "200": successResponse("#/components/schemas/ShippingQuoteListResponse"),
          "404": errorResponse,
        },
      },
    },

    "/api/orders/{orderId}/shipping-selection": {
      patch: {
        tags: ["Orders"],
        summary: "Seleccionar método de envío",
        description: "Re-cotiza de forma autoritativa; checkout bloqueado (409) sin selección previa.",
        parameters: [
          { name: "orderId", in: "path", required: true, schema: { type: "string", format: "uuid" } },
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": { schema: { $ref: "#/components/schemas/ShippingSelectionRequest" } },
          },
        },
        responses: {
          "200": successResponse("#/components/schemas/OrderDetail"),
          "404": errorResponse,
          "409": errorResponse,
        },
      },
    },

    "/api/orders/{orderId}/address": {
      patch: {
        tags: ["Orders"],
        summary: "Cambiar dirección de envío de una orden PENDING",
        description:
          "Permite corregir la dirección tras crear la orden (navegación hacia atrás en el checkout). " +
          "Actualiza el snapshot de dirección y resetea envío (shippingAmount 0, shippingStatus PENDING, " +
          "carrier/servicio null) porque el destino cambió: hay que re-cotizar. total vuelve a subtotal + impuestos.",
        parameters: [
          { name: "orderId", in: "path", required: true, schema: { type: "string", format: "uuid" } },
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": { schema: { $ref: "#/components/schemas/UpdateOrderAddressRequest" } },
          },
        },
        responses: {
          "200": successResponse("#/components/schemas/OrderDetail"),
          "404": errorResponse,
          "409": errorResponse,
        },
      },
    },

    "/api/orders/admin/all": {
      get: {
        tags: ["Orders"],
        summary: "Listar todas las órdenes (ADMIN)",
        parameters: [
          { name: "page", in: "query", schema: { type: "number", default: 1 } },
          { name: "limit", in: "query", schema: { type: "number", default: 20, maximum: 50 } },
          {
            name: "status",
            in: "query",
            schema: {
              type: "string",
              enum: ["PENDING", "PAID", "PROCESSING", "SHIPPED", "DELIVERED", "CANCELLED", "REFUNDED"],
            },
          },
          {
            name: "search",
            in: "query",
            description: "Busca por id de orden, correo o nombre del cliente, o nombre de producto (insensible a mayúsculas).",
            schema: { type: "string" },
          },
        ],
        responses: {
          "200": successResponse("#/components/schemas/AdminOrderListResponse"),
          "403": errorResponse,
        },
      },
    },

    "/api/orders/admin/{id}": {
      get: {
        tags: ["Orders"],
        summary: "Detalle de orden (ADMIN)",
        parameters: [
          { name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } },
        ],
        responses: {
          "200": successResponse("#/components/schemas/AdminOrderDetail"),
          "404": errorResponse,
        },
      },
    },

    "/api/orders/admin/{id}/status": {
      patch: {
        tags: ["Orders"],
        summary: "Progresar estado de orden manualmente (ADMIN)",
        description: "Solo transiciones manuales: PROCESSING, SHIPPED, DELIVERED.",
        parameters: [
          { name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } },
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": { schema: { $ref: "#/components/schemas/UpdateOrderStatusRequest" } },
          },
        },
        responses: {
          "200": successResponse("#/components/schemas/AdminOrderDetail"),
          "400": errorResponse,
          "404": errorResponse,
        },
      },
    },

    "/api/payments/webhook": {
      post: {
        tags: ["Payments"],
        summary: "Webhook de Wompi",
        description:
          "SIN auth (lo llama Wompi, no un usuario). Seguridad vía checksum (X-Event-Checksum), no JWT. " +
          "Siempre responde 200 si el checksum es válido (Wompi reintenta hasta 3 veces en 24h si no recibe 200). " +
          "APPROVED: descuento transaccional de stock, Order → PAID, Payment → SUCCEEDED, carrito vaciado. " +
          "DECLINED/VOIDED/ERROR: Order → CANCELLED, Payment → FAILED. " +
          "APPROVED sin stock: Order → CANCELLED + void automático vía API de Wompi.",
        security: noAuth,
        requestBody: {
          required: true,
          content: {
            "application/json": { schema: { $ref: "#/components/schemas/WompiWebhookRequest" } },
          },
        },
        responses: {
          "200": emptySuccessResponse("Evento procesado (o ya procesado antes)"),
          "401": errorResponse,
        },
      },
    },

    "/api/metrics/dashboard": {
      get: {
        tags: ["Metrics"],
        summary: "Métricas del dashboard (ADMIN)",
        responses: {
          "200": successResponse("#/components/schemas/DashboardMetrics"),
          "403": errorResponse,
        },
      },
    },
  },
  components: {
    securitySchemes: {
      bearerAuth: { type: "http", scheme: "bearer", bearerFormat: "JWT" },
    },
    schemas: {
      ErrorResponse: {
        type: "object",
        properties: {
          success: { type: "boolean", enum: [false] },
          error: {
            type: "object",
            properties: {
              code: { type: "string" },
              message: { type: "string" },
            },
            required: ["code", "message"],
          },
        },
        required: ["success", "error"],
      },

      RegisterRequest: {
        type: "object",
        properties: {
          email: { type: "string", format: "email" },
          password: { type: "string", minLength: 8 },
          firstName: { type: "string", minLength: 2, maxLength: 100 },
          lastName: { type: "string", minLength: 2, maxLength: 100 },
          phone: { type: "string" },
        },
        required: ["email", "password", "firstName", "lastName"],
      },

      LoginRequest: {
        type: "object",
        properties: {
          email: { type: "string", format: "email" },
          password: { type: "string" },
        },
        required: ["email", "password"],
      },

      RefreshRequest: {
        type: "object",
        properties: { refreshToken: { type: "string" } },
        required: ["refreshToken"],
      },

      ForgotPasswordRequest: {
        type: "object",
        properties: { email: { type: "string", format: "email" } },
        required: ["email"],
      },

      ResetPasswordRequest: {
        type: "object",
        properties: {
          token: { type: "string" },
          newPassword: { type: "string", minLength: 8 },
        },
        required: ["token", "newPassword"],
      },

      UpdateProfileRequest: {
        type: "object",
        properties: {
          firstName: { type: "string", minLength: 2, maxLength: 100 },
          lastName: { type: "string", minLength: 2, maxLength: 100 },
          email: { type: "string", format: "email" },
          phone: { type: "string", nullable: true },
        },
        minProperties: 1,
      },

      ChangePasswordRequest: {
        type: "object",
        properties: {
          currentPassword: { type: "string" },
          newPassword: { type: "string", minLength: 8 },
        },
        required: ["currentPassword", "newPassword"],
      },

      User: {
        type: "object",
        properties: {
          id: { type: "string", format: "uuid" },
          email: { type: "string", format: "email" },
          firstName: { type: "string" },
          lastName: { type: "string" },
          phone: { type: "string", nullable: true },
          role: { type: "string", enum: ["CUSTOMER", "ADMIN"] },
          createdAt: { type: "string", format: "date-time" },
        },
        required: ["id", "email", "firstName", "lastName", "phone", "role", "createdAt"],
      },

      AuthResponse: {
        type: "object",
        properties: {
          user: { $ref: "#/components/schemas/User" },
          accessToken: { type: "string" },
          refreshToken: { type: "string" },
        },
        required: ["user", "accessToken", "refreshToken"],
      },

      RefreshResponse: {
        type: "object",
        properties: {
          accessToken: { type: "string" },
          refreshToken: { type: "string" },
        },
        required: ["accessToken", "refreshToken"],
      },

      AdminUserListItem: {
        type: "object",
        properties: {
          id: { type: "string", format: "uuid" },
          email: { type: "string" },
          firstName: { type: "string" },
          lastName: { type: "string" },
          role: { type: "string" },
          createdAt: { type: "string", format: "date-time" },
        },
        required: ["id", "email", "firstName", "lastName", "role", "createdAt"],
      },

      AdminUserListResponse: {
        type: "object",
        properties: {
          items: { type: "array", items: { $ref: "#/components/schemas/AdminUserListItem" } },
          total: { type: "number" },
          page: { type: "number" },
          limit: { type: "number" },
        },
        required: ["items", "total", "page", "limit"],
      },

      ProductImage: {
        type: "object",
        properties: {
          id: { type: "string", format: "uuid" },
          url: { type: "string", format: "uri" },
          altText: { type: "string", nullable: true },
        },
        required: ["id", "url", "altText"],
      },

      ProductListItem: {
        type: "object",
        properties: {
          id: { type: "string", format: "uuid" },
          name: { type: "string" },
          slug: { type: "string" },
          basePrice: { type: "number" },
          currency: { type: "string" },
          thumbnailUrl: { type: "string", nullable: true },
          secondaryImageUrl: { type: "string", nullable: true },
          categoryName: { type: "string" },
          images: { type: "array", items: { $ref: "#/components/schemas/ProductImage" } },
          hasStock: { type: "boolean" },
          isActive: { type: "boolean" },
        },
        required: ["id", "name", "slug", "basePrice", "currency", "thumbnailUrl", "secondaryImageUrl", "categoryName", "images", "hasStock", "isActive"],
      },

      ProductDetail: {
        type: "object",
        properties: {
          id: { type: "string", format: "uuid" },
          name: { type: "string" },
          slug: { type: "string" },
          description: { type: "string" },
          basePrice: { type: "number" },
          currency: { type: "string" },
          weightGrams: { type: "number" },
          category: {
            type: "object",
            properties: {
              id: { type: "string", format: "uuid" },
              name: { type: "string" },
              slug: { type: "string" },
            },
            required: ["id", "name", "slug"],
          },
          images: { type: "array", items: { $ref: "#/components/schemas/ProductImage" } },
          variants: {
            type: "array",
            items: {
              type: "object",
              properties: {
                id: { type: "string", format: "uuid" },
                size: { type: "string" },
                color: { type: "string" },
                stock: { type: "number" },
                price: { type: "number" },
                inStock: { type: "boolean" },
              },
              required: ["id", "size", "color", "stock", "price", "inStock"],
            },
          },
        },
        required: ["id", "name", "slug", "description", "basePrice", "currency", "category", "images", "variants"],
      },

      ProductListResponse: {
        type: "object",
        properties: {
          items: { type: "array", items: { $ref: "#/components/schemas/ProductListItem" } },
          total: { type: "number" },
          page: { type: "number" },
          limit: { type: "number" },
        },
        required: ["items", "total", "page", "limit"],
      },

      CreateProductRequest: {
        type: "object",
        properties: {
          name: { type: "string", minLength: 3, maxLength: 200 },
          description: { type: "string", minLength: 10, maxLength: 5000 },
          basePrice: { type: "number", exclusiveMinimum: true, minimum: 0 },
          currency: { type: "string", default: "COP" },
          weightGrams: { type: "number", default: 300 },
          categoryId: { type: "string", format: "uuid" },
        },
        required: ["name", "description", "basePrice", "categoryId"],
      },

      UpdateProductRequest: {
        type: "object",
        properties: {
          name: { type: "string", minLength: 3, maxLength: 200 },
          description: { type: "string", minLength: 10, maxLength: 5000 },
          basePrice: { type: "number", exclusiveMinimum: true, minimum: 0 },
          currency: { type: "string" },
          weightGrams: { type: "number" },
          categoryId: { type: "string", format: "uuid" },
          isActive: { type: "boolean", description: "Activar/desactivar producto (visibilidad en tienda)." },
        },
      },

      AddProductImageRequest: {
        type: "object",
        properties: {
          url: { type: "string", format: "uri" },
          altText: { type: "string", maxLength: 200 },
          position: { type: "number", default: 0 },
        },
        required: ["url"],
      },

      VariantAdmin: {
        type: "object",
        properties: {
          id: { type: "string", format: "uuid" },
          size: { type: "string", enum: ["XS", "S", "M", "L", "XL", "XXL"] },
          color: { type: "string" },
          sku: { type: "string" },
          stock: { type: "number" },
          priceDelta: { type: "number" },
          finalPrice: { type: "number" },
          isActive: { type: "boolean" },
        },
        required: ["id", "size", "color", "sku", "stock", "priceDelta", "finalPrice", "isActive"],
      },

      VariantAdminListResponse: {
        type: "object",
        properties: {
          items: { type: "array", items: { $ref: "#/components/schemas/VariantAdmin" } },
        },
        required: ["items"],
      },

      CreateVariantRequest: {
        type: "object",
        properties: {
          size: { type: "string", enum: ["XS", "S", "M", "L", "XL", "XXL"] },
          color: { type: "string", minLength: 2, maxLength: 50 },
          sku: { type: "string", minLength: 3, maxLength: 50 },
          stock: { type: "number", default: 0 },
          priceDelta: { type: "number", default: 0 },
        },
        required: ["size", "color"],
      },

      UpdateVariantRequest: {
        type: "object",
        properties: {
          stock: { type: "number" },
          priceDelta: { type: "number" },
          sku: { type: "string", minLength: 3, maxLength: 50 },
          isActive: { type: "boolean" },
        },
      },

      Category: {
        type: "object",
        properties: {
          id: { type: "string", format: "uuid" },
          name: { type: "string" },
          slug: { type: "string" },
          description: { type: "string", nullable: true },
        },
        required: ["id", "name", "slug", "description"],
      },

      CategoryListResponse: {
        type: "object",
        properties: {
          items: { type: "array", items: { $ref: "#/components/schemas/Category" } },
        },
        required: ["items"],
      },

      CategoryAdminListResponse: {
        type: "object",
        properties: {
          items: { type: "array", items: { $ref: "#/components/schemas/Category" } },
          total: { type: "number" },
          page: { type: "number" },
          limit: { type: "number" },
        },
        required: ["items", "total", "page", "limit"],
      },

      CreateCategoryRequest: {
        type: "object",
        properties: {
          name: { type: "string", minLength: 2, maxLength: 100 },
          description: { type: "string", maxLength: 1000 },
        },
        required: ["name"],
      },

      UpdateCategoryRequest: {
        type: "object",
        properties: {
          name: { type: "string", minLength: 2, maxLength: 100 },
          description: { type: "string", maxLength: 1000 },
        },
      },

      CartItem: {
        type: "object",
        properties: {
          id: { type: "string", format: "uuid" },
          variantId: { type: "string", format: "uuid" },
          productName: { type: "string" },
          productSlug: { type: "string" },
          size: { type: "string" },
          color: { type: "string" },
          thumbnailUrl: { type: "string", nullable: true },
          unitPrice: { type: "number" },
          quantity: { type: "number" },
          subtotal: { type: "number" },
          availableStock: { type: "number" },
          isAvailable: { type: "boolean" },
        },
        required: ["id", "variantId", "productName", "productSlug", "size", "color", "thumbnailUrl", "unitPrice", "quantity", "subtotal", "availableStock", "isAvailable"],
      },

      Cart: {
        type: "object",
        properties: {
          id: { type: "string", format: "uuid" },
          items: { type: "array", items: { $ref: "#/components/schemas/CartItem" } },
          totalItems: { type: "number" },
          subtotal: { type: "number" },
        },
        required: ["id", "items", "totalItems", "subtotal"],
      },

      AddCartItemRequest: {
        type: "object",
        properties: {
          variantId: { type: "string", format: "uuid" },
          quantity: { type: "number", minimum: 1, maximum: 20 },
        },
        required: ["variantId", "quantity"],
      },

      UpdateCartItemRequest: {
        type: "object",
        properties: {
          quantity: { type: "number", minimum: 1, maximum: 20 },
        },
        required: ["quantity"],
      },

      Address: {
        type: "object",
        properties: {
          id: { type: "string", format: "uuid" },
          fullName: { type: "string" },
          phone: { type: "string" },
          line1: { type: "string" },
          line2: { type: "string", nullable: true },
          city: { type: "string" },
          state: { type: "string" },
          country: { type: "string" },
          postalCode: { type: "string", nullable: true },
          isDefault: { type: "boolean" },
        },
        required: ["id", "fullName", "phone", "line1", "line2", "city", "state", "country", "postalCode", "isDefault"],
      },

      AddressListResponse: {
        type: "object",
        properties: {
          items: { type: "array", items: { $ref: "#/components/schemas/Address" } },
        },
        required: ["items"],
      },

      CreateAddressRequest: {
        type: "object",
        properties: {
          fullName: { type: "string", minLength: 3, maxLength: 150 },
          phone: { type: "string", minLength: 7, maxLength: 20 },
          line1: { type: "string", minLength: 5, maxLength: 200 },
          line2: { type: "string", maxLength: 200 },
          city: { type: "string", minLength: 2, maxLength: 100 },
          state: { type: "string", minLength: 2, maxLength: 100 },
          country: { type: "string", default: "CO" },
          postalCode: { type: "string", maxLength: 20 },
          isDefault: { type: "boolean", default: false },
        },
        required: ["fullName", "phone", "line1", "city", "state"],
      },

      UpdateAddressRequest: {
        type: "object",
        properties: {
          fullName: { type: "string", minLength: 3, maxLength: 150 },
          phone: { type: "string", minLength: 7, maxLength: 20 },
          line1: { type: "string", minLength: 5, maxLength: 200 },
          line2: { type: "string", maxLength: 200 },
          city: { type: "string", minLength: 2, maxLength: 100 },
          state: { type: "string", minLength: 2, maxLength: 100 },
          country: { type: "string" },
          postalCode: { type: "string", maxLength: 20 },
          isDefault: { type: "boolean" },
        },
      },

      OrderItem: {
        type: "object",
        properties: {
          id: { type: "string", format: "uuid" },
          productName: { type: "string" },
          size: { type: "string" },
          color: { type: "string" },
          unitPrice: { type: "number" },
          quantity: { type: "number" },
          lineTotal: { type: "number" },
        },
        required: ["id", "productName", "size", "color", "unitPrice", "quantity", "lineTotal"],
      },

      OrderListItem: {
        type: "object",
        properties: {
          id: { type: "string", format: "uuid" },
          status: { type: "string" },
          total: { type: "number" },
          currency: { type: "string" },
          itemsCount: { type: "number" },
          createdAt: { type: "string", format: "date-time" },
        },
        required: ["id", "status", "total", "currency", "itemsCount", "createdAt"],
      },

      OrderDetail: {
        type: "object",
        properties: {
          id: { type: "string", format: "uuid" },
          status: { type: "string" },
          subtotal: { type: "number" },
          taxAmount: { type: "number" },
          shippingAmount: { type: "number" },
          total: { type: "number" },
          currency: { type: "string" },
          items: { type: "array", items: { $ref: "#/components/schemas/OrderItem" } },
          shippingAddressId: { type: "string", format: "uuid" },
          shippingFullName: { type: "string" },
          shippingPhone: { type: "string" },
          shippingLine1: { type: "string" },
          shippingLine2: { type: "string", nullable: true },
          shippingCity: { type: "string" },
          shippingState: { type: "string" },
          shippingCountry: { type: "string" },
          shippingPostalCode: { type: "string", nullable: true },
          shippingCarrier: { type: "string", nullable: true },
          shippingService: { type: "string", nullable: true },
          shippingTrackingNumber: { type: "string", nullable: true },
          shippingLabelUrl: { type: "string", nullable: true },
          shippingStatus: { type: "string", enum: ["PENDING", "LABEL_GENERATED", "LABEL_FAILED"] },
          createdAt: { type: "string", format: "date-time" },
        },
        required: ["id", "status", "subtotal", "taxAmount", "shippingAmount", "total", "currency", "items", "shippingAddressId", "shippingFullName", "shippingPhone", "shippingLine1", "shippingLine2", "shippingCity", "shippingState", "shippingCountry", "shippingPostalCode", "shippingCarrier", "shippingService", "shippingTrackingNumber", "shippingLabelUrl", "shippingStatus", "createdAt"],
      },

      OrderListResponse: {
        type: "object",
        properties: {
          items: { type: "array", items: { $ref: "#/components/schemas/OrderListItem" } },
          total: { type: "number" },
          page: { type: "number" },
          limit: { type: "number" },
        },
        required: ["items", "total", "page", "limit"],
      },

      AdminOrderListItem: {
        allOf: [
          { $ref: "#/components/schemas/OrderListItem" },
          {
            type: "object",
            properties: {
              customerEmail: { type: "string" },
              customerName: { type: "string" },
            },
            required: ["customerEmail", "customerName"],
          },
        ],
      },

      AdminOrderDetail: {
        allOf: [
          { $ref: "#/components/schemas/OrderDetail" },
          {
            type: "object",
            properties: {
              customerEmail: { type: "string" },
              customerName: { type: "string" },
            },
            required: ["customerEmail", "customerName"],
          },
        ],
      },

      AdminOrderListResponse: {
        type: "object",
        properties: {
          items: { type: "array", items: { $ref: "#/components/schemas/AdminOrderListItem" } },
          total: { type: "number" },
          page: { type: "number" },
          limit: { type: "number" },
        },
        required: ["items", "total", "page", "limit"],
      },

      CreateOrderRequest: {
        type: "object",
        properties: {
          addressId: { type: "string", format: "uuid" },
          idempotencyKey: { type: "string", format: "uuid" },
        },
        required: ["addressId", "idempotencyKey"],
      },

      ShippingSelectionRequest: {
        type: "object",
        properties: {
          carrier: { type: "string" },
          service: { type: "string" },
        },
        required: ["carrier", "service"],
      },

      UpdateOrderAddressRequest: {
        type: "object",
        properties: {
          addressId: { type: "string", format: "uuid" },
        },
        required: ["addressId"],
      },

      UpdateOrderStatusRequest: {
        type: "object",
        properties: {
          status: { type: "string", enum: ["PROCESSING", "SHIPPED", "DELIVERED"] },
        },
        required: ["status"],
      },

      ShippingRateOption: {
        type: "object",
        properties: {
          carrier: { type: "string" },
          service: { type: "string" },
          serviceDescription: { type: "string" },
          deliveryEstimate: { type: "string" },
          totalPrice: { type: "number" },
          currency: { type: "string" },
        },
        required: ["carrier", "service", "serviceDescription", "deliveryEstimate", "totalPrice", "currency"],
      },

      ShippingQuoteListResponse: {
        type: "object",
        properties: {
          items: { type: "array", items: { $ref: "#/components/schemas/ShippingRateOption" } },
        },
        required: ["items"],
      },

      CheckoutParams: {
        type: "object",
        properties: {
          publicKey: { type: "string" },
          currency: { type: "string" },
          amountInCents: { type: "number" },
          reference: { type: "string" },
          signature: { type: "string" },
          redirectUrl: { type: "string", format: "uri" },
        },
        required: ["publicKey", "currency", "amountInCents", "reference", "signature", "redirectUrl"],
      },

      WompiWebhookRequest: {
        type: "object",
        properties: {
          event: { type: "string" },
          data: {
            type: "object",
            properties: {
              transaction: {
                type: "object",
                properties: {
                  id: { type: "string" },
                  status: { type: "string", enum: ["APPROVED", "DECLINED", "VOIDED", "ERROR", "PENDING"] },
                  amount_in_cents: { type: "number" },
                  reference: { type: "string" },
                },
                required: ["id", "status", "amount_in_cents", "reference"],
              },
            },
            required: ["transaction"],
          },
          signature: {
            type: "object",
            properties: {
              checksum: { type: "string" },
              properties: { type: "array", items: { type: "string" } },
            },
            required: ["checksum", "properties"],
          },
          timestamp: { type: "number" },
        },
        required: ["event", "data", "signature", "timestamp"],
      },

      LowStockVariant: {
        type: "object",
        properties: {
          id: { type: "string", format: "uuid" },
          productName: { type: "string" },
          size: { type: "string" },
          color: { type: "string" },
          stock: { type: "number" },
        },
        required: ["id", "productName", "size", "color", "stock"],
      },

      DashboardMetrics: {
        type: "object",
        properties: {
          totalOrders: { type: "number" },
          totalRevenue: { type: "number" },
          ordersByStatus: {
            type: "object",
            additionalProperties: { type: "number" },
          },
          totalCustomers: { type: "number" },
          lowStockVariants: {
            type: "array",
            items: { $ref: "#/components/schemas/LowStockVariant" },
          },
        },
        required: ["totalOrders", "totalRevenue", "ordersByStatus", "totalCustomers", "lowStockVariants"],
      },
    },
  },
};
