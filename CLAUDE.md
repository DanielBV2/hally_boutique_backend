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
- Variant tiene isActive (soft delete), igual que Product. GET público de productos
  filtra variantes con isActive: true.
- IMPORTANTE (pendiente para módulo orders): el descuento de stock al confirmar una
  compra debe hacerse con prisma.$transaction y actualización condicional
  (WHERE stock >= quantity) para evitar condiciones de carrera en compras simultáneas.
  Nunca hacer read-then-write simple para descontar stock.

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

Express 5 convirtió req.query en un getter que se recalcula en cada acceso
(no solo de solo-lectura: además no persiste mutaciones simples). Object.assign
NO es suficiente — hay que usar Object.defineProperty(req, 'query', { value,
writable: true, configurable: true, enumerable: true }) para reemplazar la
propiedad completa. body y params sí se pueden reasignar normalmente
(req[target] = result.data), no cambiaron en Express 5.

## Auth
`authMiddleware` valida JWT del header `Authorization: Bearer <token>` e inyecta
`req.user`. `roleMiddleware` restringe por rol (`CUSTOMER` | `ADMIN`).
- Passwords hasheadas con bcrypt (12 rounds), nunca texto plano.
- JWT payload mínimo: { id, email, role }. Expira según JWT_EXPIRES_IN.
- Registro público siempre crea role: CUSTOMER. No existe endpoint para
  autoregistrarse como ADMIN — se crean manualmente (seed/DB directa).
- Login usa mensaje de error genérico ("Credenciales inválidas") tanto para
  email inexistente como password incorrecta, para no filtrar qué emails existen.
- PENDIENTE (requiere servicio de email, no implementado aún): forgot-password /
  reset-password.
- PENDIENTE (antes de producción real): refresh tokens — hoy solo hay access token
  de larga duración, aceptable para desarrollo pero no ideal para producción.

## Categories (implementado)
- Mismo patrón de soft delete (isActive) que Product y Variant.
- Slug generado en el Service a partir de name, con colisión manejada igual
  que products (sufijo numérico incremental).
- Regla de negocio: no se puede desactivar (soft delete) una categoría que
  tiene productos activos asociados → ConflictError.
- No depender más de pgAdmin/Prisma Studio para crear categorías — usar
  POST /api/categories.

## Orders + Payments — Decisión de arquitectura
Flujo elegido: descuento de stock DIFERIDO hasta confirmación de pago (no al
crear la orden). Razón: evita necesitar jobs de expiración para órdenes
abandonadas; el trade-off aceptado es el caso raro de sobreventa en alta
demanda simultánea, manejado con reembolso automático vía Stripe.

Secuencia:
1. POST /orders crea Order (PENDING) + Payment (PENDING) desde el carrito,
   snapshot de OrderItems, SIN tocar stock. Genera Stripe Checkout Session.
2. Webhook checkout.session.completed de Stripe dispara el descuento
   transaccional de stock (prisma.$transaction, UPDATE condicional
   WHERE stock >= quantity). Si tiene éxito: Order → PAID, Payment → SUCCEEDED,
   se vacía el carrito. Si falla: Order → CANCELLED, Payment → FAILED,
   reembolso automático vía Stripe API.
3. Frontend nunca confía en la URL de redirect de Stripe para mostrar estado
   — siempre consulta GET /orders/:id, que refleja el estado real actualizado
   por el webhook.

Stripe Checkout Session (hospedado), no Payment Intents + Elements — menor
superficie de riesgo, tu servidor nunca procesa datos de tarjeta.
  
## Testing
- Unit tests: mockear repositories, testear services en aislamiento.
- Los repositories no se testean con mocks de Prisma — se testean contra la DB de
  test real (o se cubren indirectamente vía tests de integración).
- Checkout/pagos requieren tests de integración cuidadosos (es la parte más
  sensible del sistema).

## Estado actual del proyecto (actualizado)
- [x] Schema de Prisma completo y migrado
- [x] Middlewares base — incluye fix de compatibilidad Express 5 para req.query
- [x] Módulo auth — probado manualmente
- [x] Módulo products — probado manualmente
- [x] Submódulo variants (dentro de products) — probado manualmente
- [x] Módulo categories — probado manualmente
- [x] Módulo cart — probado manualmente (get-or-create, incremento de
      cantidad, validación de stock suave, ownership de items, disponibilidad
      en tiempo real con isAvailable/availableStock)
- [ ] Módulo orders (siguiente — el más delicado hasta ahora)
- [ ] Módulo payments (Stripe)

## Regla operativa importante
Nunca borrar filas directamente desde pgAdmin/Prisma Studio en tablas de
negocio (products, orders, etc.) — rompe soft delete y trazabilidad. Esas
herramientas son solo para consultar y para poblar datos semilla iniciales
(ej. categorías). Todo cambio de estado real debe pasar por la API.

## Convención de commits
Conventional Commits (`feat:`, `fix:`, `refactor:`, `test:`, `docs:`).