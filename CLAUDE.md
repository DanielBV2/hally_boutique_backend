# HallyBoutique Backend — Contexto del proyecto

## Stack
- Node.js + TypeScript (tipado estricto, evitar `any`)
- Express
- PostgreSQL + Prisma ORM
- Zod para validación
- JWT para autenticación
- Stripe para pagos (diseñado para soportar más proveedores después, ver `PaymentProvider`)

## Objetivo del proyecto
Backend de e-commerce de ropa. Empieza como proyecto de portafolio con arquitectura
impecable y bien testeada, con la intención de evolucionar a tienda real en producción
(Colombia). Todas las decisiones de diseño deben tolerar ese crecimiento sin requerir
reescrituras grandes.

## Arquitectura: modular por dominios + Repository Pattern

Cada dominio de negocio vive en su propia carpeta bajo `src/modules/`, totalmente
encapsulado. NO mezclar responsabilidades entre capas.

```
src/modules/<dominio>/
├── <dominio>.dto.ts          # Shapes de entrada/salida (request/response)
├── <dominio>.repository.ts   # ÚNICA capa que toca Prisma directamente
├── <dominio>.service.ts      # Lógica de negocio, orquesta repositories
├── <dominio>.controller.ts   # Recibe req/res, llama al service, no tiene lógica de negocio
├── <dominio>.routes.ts       # Define endpoints y aplica middlewares
├── <dominio>.schema.ts       # Schemas de Zod para validación de este dominio
└── <dominio>.types.ts        # Tipos internos del dominio
```

### Reglas estrictas por capa

- **Repository**: solo queries de Prisma. No debe contener lógica de negocio ni
  validaciones. Si mañana cambiamos de DB, solo esta capa se toca.
- **Service**: contiene TODA la lógica de negocio (cálculos, reglas, orquestación
  entre repositories). Nunca importa Prisma directamente, solo repositories.
- **Controller**: delgado. Extrae datos del request, llama al service, formatea
  response. Nunca contiene lógica de negocio ni queries.
- **DTOs**: definen la forma exacta de lo que entra (input) y sale (output) de cada
  endpoint. No exponer directamente los modelos de Prisma al cliente.

### Reglas de negocio importantes ya definidas
- Nunca borrar `Order` con pago asociado — usar `cancelOrder` (cambia status), no `deleteOrder`.
- Stock vive en `Variant`, nunca en `Product`.
- `Order`/`OrderItem` guardan snapshot de precio/nombre — nunca recalcular desde el catálogo actual.
- Toda creación de orden debe usar `idempotencyKey` para evitar duplicados.
- Descuento de stock al crear una orden debe ser transaccional (usar `prisma.$transaction`)
  para evitar condiciones de carrera.
- Nunca manejar ni almacenar datos de tarjeta directamente — solo IDs de referencia de Stripe/proveedor.

## Validación
Todas las rutas que reciben `body`, `params` o `query` deben usar Zod +
`validateSchemaMiddleware` (definido en `src/middlewares/`). No confiar en tipado
de TypeScript solo — validar en runtime siempre.

## Respuestas de API
Usar un formato consistente definido en `src/shared/types/`:
```ts
type ApiResponse<T> =
  | { success: true; data: T }
  | { success: false; error: { code: string; message: string } };
```

## Manejo de errores
Usar clases de error custom en `src/shared/errors/` (ej. `NotFoundError`,
`ValidationError`, `UnauthorizedError`) capturadas por un `errorHandler` middleware
centralizado. Los controllers no hacen try/catch manual para cada caso — lanzan el
error custom y el middleware lo traduce a la respuesta HTTP correcta.

### Nota sobre Express 5
Proyecto usa Express 5. Los controllers/services usan async/await; los errores
lanzados (throw) dentro de funciones async son capturados automáticamente por
Express y enrutados al errorHandler — NO se necesita wrapper catchAsync/asyncHandler.

## Auth
`authMiddleware` valida JWT del header `Authorization: Bearer <token>` e inyecta
`req.user`. `roleMiddleware` restringe por rol (`CUSTOMER` | `ADMIN`).

## Testing
- Unit tests: mockear repositories, testear services en aislamiento.
- Los repositories no se testean con mocks de Prisma — se testean contra la DB de
  test real (o se cubren indirectamente vía tests de integración).
- Checkout/pagos requieren tests de integración cuidadosos (es la parte más
  sensible del sistema).

## Estado actual del proyecto
- [x] Schema de Prisma completo y migrado (User, Address, Category, Product,
      ProductImage, Variant, Cart, CartItem, Order, OrderItem, Payment)
- [x] PostgreSQL local corriendo, conexión funcionando
- [x] Middlewares base (authMiddleware, validateSchemaMiddleware, errorHandler, roleMiddleware)
- [x] Módulo `products` (siguiente paso)
- [ ] Módulo `auth`
- [ ] Módulo `cart`
- [ ] Módulo `orders`
- [ ] Módulo `payments` (Stripe)

## Convención de commits
Conventional Commits (`feat:`, `fix:`, `refactor:`, `test:`, `docs:`).