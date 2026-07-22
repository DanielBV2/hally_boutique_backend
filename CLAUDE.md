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
demanda simultánea, manejado con reembolso automático vía Wompi.

Proveedor de pagos: **Wompi** (Bancolombia). Stripe fue la decisión original,
pero no está disponible para cuentas constituidas en Colombia (confirmado
julio 2026) — se descartó antes de implementar nada. El enum PaymentProvider
en el schema ya contempla WOMPI.

Secuencia:
1. POST /orders crea Order (PENDING) + Payment (PENDING) desde el carrito,
   snapshot de OrderItems, SIN tocar stock. Genera un link de Wompi Web
   Checkout (hospedado — el cliente nunca ingresa datos de tarjeta en
   nuestro servidor).
2. Webhook de Wompi (evento de transacción aprobada) dispara el descuento
   transaccional de stock (prisma.$transaction, UPDATE condicional
   WHERE stock >= quantity). Si tiene éxito: Order → PAID, Payment → SUCCEEDED,
   se vacía el carrito. Si falla: Order → CANCELLED, Payment → FAILED,
   reembolso automático vía API de Wompi.
3. Frontend nunca confía en la URL de redirect de Wompi para mostrar estado
   — siempre consulta GET /orders/:id, que refleja el estado real actualizado
   por el webhook.

Wompi Web Checkout (hospedado, ambiente Sandbox para desarrollo), no
integración de formulario de tarjeta propio — menor superficie de riesgo,
tu servidor nunca procesa datos de tarjeta. Moneda nativa COP, sin conversión.

## Orders (implementado, sin Payment todavía)
- POST /orders crea Order + OrderItems desde el carrito actual, snapshot
  completo de nombre/precio/talla/color al momento de la compra.
- NO crea Payment todavía (ese registro se crea en el módulo payments, al
  generar la Stripe Checkout Session) — Order.payment es opcional en el schema.
- NO descuenta stock (eso ocurre solo en el webhook de pago exitoso, dentro
  de payments).
- NO vacía el carrito al crear la orden (se vacía solo tras pago confirmado).
- idempotencyKey la genera el CLIENTE (frontend), se reenvía en reintentos;
  el Service devuelve la orden existente si ya existe una con esa key para
  ese usuario, en vez de duplicar.
- taxAmount y shippingAmount son 0 (placeholders) — cálculo real pendiente,
  funcionalidad futura no diseñada aún.

## Payments — Detalles técnicos de integración Wompi
Ambientes: Sandbox (https://sandbox.wompi.co/v1) y Producción
(https://production.wompi.co/v1), completamente separados, cada uno con
su propio set de llaves y URL de eventos.

4 llaves necesarias (prefijo _test_ en sandbox, _prod_ en producción):
- pub_test_... : llave pública, va en el formulario de checkout (frontend-safe)
- prv_test_... : llave privada, para llamadas autenticadas a la API de Wompi
- test_integrity_... : secreto de integridad, firma el checkout (SOLO backend)
- test_events_... : secreto de eventos, valida el checksum del webhook (SOLO backend)

Flujo de checkout (Web Checkout, formulario HTML hospedado):
1. Backend genera la firma de integridad: SHA256(reference + amount_in_cents
   + currency + secreto_integridad) — reference es nuestro Order.idempotencyKey,
   ya único por diseño.
2. Backend devuelve al frontend los parámetros necesarios (public-key, currency,
   amount-in-cents, reference, signature de integridad, redirect-url) para que
   el frontend arme el formulario que apunta a https://checkout.wompi.co/p/.
3. Cliente completa el pago en la página de Wompi (fuera de nuestro dominio).
4. Wompi redirige de vuelta a redirect-url (solo informativo, NUNCA se usa
   para confirmar el pago).
5. Wompi envía un webhook (evento transaction.updated) a nuestra URL de
   eventos configurada en el Dashboard de Wompi (una URL distinta por
   ambiente: sandbox y producción).
6. Backend valida el checksum del webhook: SHA256(transaction.id +
   transaction.status + transaction.amount_in_cents + timestamp +
   secreto_eventos), comparado contra header X-Event-Checksum.
7. Si válido y status === "APPROVED": descuento transaccional de stock,
   Order → PAID, Payment → SUCCEEDED, se vacía el carrito.
   Si status === "DECLINED" o "ERROR": Order → CANCELLED, Payment → FAILED.
8. Responder siempre 200 al webhook (Wompi reintenta hasta 3 veces en 24h
   si no recibe 200).

## Payments — Implementación (Wompi)
- POST /api/orders/:orderId/checkout: valida ownership + status PENDING,
  calcula amount_in_cents, genera signature de integridad (SHA256), crea
  Payment (PENDING), devuelve datos para que el frontend arme el formulario
  de Wompi Web Checkout.
- POST /api/payments/webhook: SIN authMiddleware (lo llama Wompi, no un
  usuario). Seguridad vía checksum (verifyEventChecksum), no JWT.
- Checksum inválido → 401, no se procesa el evento.
- Idempotencia: si Order.status !== PENDING al recibir el webhook, se ignora
  (ya procesado antes).
- APPROVED + stock disponible → Order: PAID, Payment: SUCCEEDED, se vacía
  el carrito, descuento transaccional de stock (WHERE stock >= quantity).
- APPROVED pero sin stock suficiente → Order: CANCELLED, Payment: FAILED.
  PENDIENTE: automatizar reembolso vía API de Wompi (endpoint no confirmado
  aún, revisar antes de producción real).
- DECLINED/VOIDED/ERROR → Order: CANCELLED, Payment: FAILED.
- PENDING (ej. algunos pagos con PSE) → no se hace nada, se espera próximo webhook.
- Requiere ngrok (o similar) para exponer localhost durante pruebas, ya que
  Wompi necesita una URL pública para enviar el webhook — se configura en
  el Dashboard de Wompi, sección Eventos.
  
## Deuda técnica consciente (no bloqueante)
- Order.shippingAddressId es referencia a Address, NO es snapshot (a
  diferencia de OrderItem). Si el usuario edita su dirección después de
  comprar, el historial de la orden reflejaría el cambio retroactivamente.
  Mejora pendiente antes de producción real: copiar los campos de dirección
  directamente en Order en el momento de la compra.
  
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
- [x] Refactor: toSlug/generateUniqueSlug en src/shared/utils/slugify.ts
- [x] Módulo cart — probado manualmente
- [x] Módulo addresses — probado manualmente (ownership, exclusividad de
      isDefault, bloqueo de borrado con órdenes asociadas confirmado con 409)
- [x] Módulo orders — probado manualmente (snapshot de items, idempotencia
      real confirmada, validación de stock, ownership en listado/detalle,
      NO descuenta stock, NO vacía carrito, NO crea Payment todavía)
- [ ] Módulo payments (Stripe) — SIGUIENTE. Aquí se completa el flujo:
      Checkout Session, webhook, descuento transaccional de stock, vaciado
      de carrito tras pago confirmado.

## Regla operativa importante
Nunca borrar filas directamente desde pgAdmin/Prisma Studio en tablas de
negocio (products, orders, etc.) — rompe soft delete y trazabilidad. Esas
herramientas son solo para consultar y para poblar datos semilla iniciales
(ej. categorías). Todo cambio de estado real debe pasar por la API.

## Convención de commits
Conventional Commits (`feat:`, `fix:`, `refactor:`, `test:`, `docs:`).