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

## Arquitectura de autenticación Frontend-Backend (decisión, a implementar en frontend)
Patrón BFF (Backend For Frontend): las cookies httpOnly viven en el
dominio de Next.js, NUNCA en el de Express. El navegador solo habla con
las Route Handlers de Next.js (server-side), que leen la cookie, extraen
el token, y llaman a Express server-to-server con Authorization: Bearer
<token> — exactamente el mismo mecanismo que ya usa authMiddleware hoy,
sin cambios.

Flujo: browser → Next.js Route Handler (lee cookie httpOnly) → fetch
server-to-server → Express API (Bearer token, sin cambios) → respuesta →
Next.js setea/actualiza la cookie httpOnly → responde al browser.

Ventaja: las peticiones autenticadas nunca cruzan CORS del navegador
(son servidor-a-servidor). CORS en Express solo importa para endpoints
públicos que el navegador podría llamar directamente (catálogo).

Express/authMiddleware NO requieren ningún cambio — siguen esperando
Bearer token exactamente como siempre.

## Refresh Tokens — COMPLETADO Y VERIFICADO
Access token JWT reducido a 15 minutos de vida (antes 7 días). Refresh
token opaco (crypto random, 40 bytes), hasheado con SHA256 en DB, nunca
almacenado en texto plano.

Rotación en cada uso: al refrescar, el token usado se marca revoked y se
emite uno nuevo (replacedByTokenId enlaza la cadena).

Detección de reuso verificada end-to-end: usar un refresh token ya
revocado dispara revokeAllForUser(), invalidando TODA la sesión del
usuario (no solo ese token) — protege contra el escenario de un refresh
token robado siendo usado en paralelo al legítimo.

Endpoints: POST /auth/refresh, POST /auth/logout (idempotente).
AuthResponseDTO renombrado: "token" → "accessToken" + "refreshToken" nuevo.

PENDIENTE (no bloqueante): investigar por qué prisma migrate dev no
regenera el cliente automáticamente en este proyecto — requiere
prisma generate manual después de cada migración, repetido 3+ veces.

## Forgot-password (Resend) — COMPLETADO Y VERIFICADO
Proveedor: Resend (elegido tras comparar contra SendGrid/Mailgun/Postmark/
Brevo — mejor tier gratuito, mejor DX, SDK TypeScript nativo). Modo de
pruebas usa el dominio onboarding@resend.dev de Resend, sin necesitar
verificar dominio propio todavía.

Flujo probado end-to-end con correo real recibido: forgot-password
(siempre 200, mensaje genérico, nunca revela si el email existe),
reset-password (token de un solo uso, expira en 60 min, mismo mensaje de
error para token inexistente/usado/expirado). Al resetear exitosamente,
se revocan TODOS los refresh tokens del usuario (cierre de sesión forzado
en todos los dispositivos) — verificado que un refresh token de antes del
reset queda invalidado.

PENDIENTE (no bloqueante, para cuando exista dominio propio/producción):
verificar un dominio propio en Resend para no depender de
onboarding@resend.dev, y confirmar si esa restricción de sandbox limita
el envío solo a la cuenta propia (no se llegó a probar ese límite
específico, ya que el problema real encontrado fue un email mal
registrado, no una restricción del proveedor).

112/112 tests pasando.

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

## Shipping (Envia.com) — Fase 1 COMPLETADA Y VERIFICADA
Flujo completo probado end-to-end en sandbox: shipping-quote (cotización
real de InterRapidísimo/Coordinadora vía API), shipping-selection (con
re-cotización autoritativa), envío gratis sobre FREE_SHIPPING_THRESHOLD,
envío con costo real bajo el umbral, checkout bloqueado sin selección de
envío (409), pago completo con Wompi incluyendo IVA + envío en el total,
descuento de stock y vaciado de carrito confirmados tras pago exitoso.

Bugs de formato de la API de Envia.com resueltos:
- state debe ser código de 3 letras (ej. "BOL"), no nombre completo del
  departamento — tabla de conversión en colombiaDepartmentCodes.ts.
- packages requiere el campo "content" (descripción del contenido).
- Precios en modo Sandbox de Envia.com son valores ficticios de prueba
  (ej. $60, $70 COP) — NO representativos de tarifas reales; esto es
  comportamiento esperado y documentado por Envia.com para su ambiente
  de pruebas, confirmado directamente con ellos. En producción con
  llaves reales, los montos reflejarán tarifas reales.

## Shipping (Envia.com) — Errores de cotización visibles (mejora #10) — COMPLETADO
getShippingRate tragaba los errores en silencio (`catch { return []; }`): si
Envia.com fallaba (timeout, 5xx, respuesta sin datos), el checkout caía al
estimado estático sin dejar NINGÚN rastro de qué pasó — parecía que la
cotización real "simplemente no existía".

- El logging temporal `[DEBUG Envia]` ya había sido removido (la nota
  PENDIENTE anterior estaba obsoleta).
- Ahora `getShippingRate` loguea `console.warn` con contexto (carrier +
  motivo) tanto en fallo de red/timeout como en respuesta no-OK sin datos,
  y SIGUE degradando a `[]` (el estimado estático sigue funcionando como
  fallback). El admin/desarrollador ve en los logs por qué se usó el
  estimado en vez de tarifas reales.
- 2 tests nuevos: fallo HTTP 500 y fallo de red, ambos verifican el warning
  con el carrier y el retorno `[]`.

148/148 tests pasando, typecheck limpio.

## Cart — carreras de read-then-write eliminadas (mejora #11) — COMPLETADO
Dos métodos del CartRepository hacían read-then-write (leer y luego
decidir en base a lo leído), una condición de carrera clásica: con dos
peticiones concurrentes para el mismo usuario/variante, ambas podían leer
"no existe" y disparar un CREATE duplicado → violación de constraint único
(500). Reemplazados por `upsert` nativo de Prisma (atómico en la DB):

- `findOrCreateByUserId(userId, tx?)`: antes `findUnique` + `create`;
  ahora `prisma.cart.upsert({ where: { userId }, update: {}, create: ... })`
  (userId es `@unique`). Sigue aceptando `tx?` para el webhook de pago.
- `upsertItem(cartId, variantId, quantity)`: antes `findUnique` +
  `update`/`create`; ahora `prisma.cartItem.upsert({ where: {
  cartId_variantId }, update: { quantity: { increment: quantity } },
  create: ... })` (clave compuesta única `@@unique([cartId, variantId])`).
  Dos adds concurrentes ya no se pisan: el incremento es atómico.

Mismo comportamiento observable (item existente suma cantidad; nuevo se
crea con quantity), solo que sin ventana de carrera. Sin cambio de
interfaces, sin cambios en tests (los services mockean la interfaz).

## Tipos de transacción tipificados (mejora #12) — COMPLETADO
`TransactionRunner` en `payment.service.ts` usaba `(tx: any)` (con un
eslint-disable encima) y `VariantStockRepository.decrementStockIfAvailable`
recibía `tx: unknown`. Ambos quedaron tipados con
`Prisma.TransactionClient`:

- `runTransaction<T>(fn: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T>`
  — ya no hay `any` ni `no-explicit-any` en el flujo de pagos.
- `decrementStockIfAvailable(variantId, quantity, tx: Prisma.TransactionClient)`
  — coincide con la firma concreta de `PrismaVariantRepository`.
- El wiring `{ runTransaction: (fn) => prisma.$transaction(fn) }` sigue
  typecheckeando sin cambios (Prisma.TransactionClient es el mismo tipo
  que el cliente que recibe `$transaction`).

148/148 tests pasando, typecheck limpio.

## Shipping (Envia.com) — Fase 2 COMPLETADA Y VERIFICADA
Generación automática de guía de envío tras confirmación de pago (webhook
Wompi → Order PAID → generateShippingLabel). Verificado end-to-end: PDF
real de guía descargado y confirmado, con tracking number real
(ej. INTESBX679045), origen/destino/contenido/peso correctos.

Campos adicionales requeridos por /ship/generate/ que NO eran necesarios
en /ship/rate/ (descubiertos por iteración empírica, documentando para no
repetir el ciclo de prueba-error):
- settings: { printFormat: 'PDF', printSize: 'STOCK_4X6', currency: 'COP' }
  — obligatorio en generate, no existe en rate.
- number (número de la dirección, separado de street) — obligatorio en
  ambos origin y destination para generate.
  - Origen: viene de SHIPPING_ORIGIN_NUMBER (env var nueva).
  - Destino: extraído automáticamente de shippingLine1 con regex
    (extractStreetNumber) — DEUDA TÉCNICA CONSCIENTE: es una extracción
    por adivinanza de texto libre, no un campo dedicado. Antes de
    producción real, considerar rediseñar el formulario de direcciones
    para pedir el número de forma explícita y separada.

Si generateShippingLabel falla, el Order permanece en PAID (nunca se
revierte un pago ya confirmado) — solo se loguea con
"⚠️ GENERACIÓN DE GUÍA FALLIDA" para intervención manual desde el
dashboard de Envia.com.

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

  ## Payments (Wompi) — Verificación completa
Los 3 escenarios críticos fueron probados manualmente en sandbox y confirmados
funcionando correctamente:
1. Pago APROBADO con stock disponible → Order: PAID, Payment: SUCCEEDED,
   stock descontado correctamente, carrito vaciado.
2. Pago DECLINADO → Order: CANCELLED, Payment: FAILED, sin efectos
   secundarios (stock y carrito intactos).
3. Pago APROBADO pero SIN stock disponible (cambió entre checkout y pago) →
   Order: CANCELLED, Payment: FAILED, stock no queda negativo ni con
   descuento parcial. Confirma que el sistema no confía ciegamente en el
   estado de Wompi cuando el inventario real no lo permite.

PENDIENTE (no bloqueante, anotado desde el diseño original): automatizar
reembolso vía API de Wompi para el caso 3 — actualmente el dinero del
cliente quedaría cobrado por Wompi sin reembolso automático de nuestro
lado. Antes de producción real, hay que implementar esto explícitamente.

## Reembolso automático (Wompi Void) — Implementado
Payment.providerTransactionId (nuevo campo, nullable, unique) guarda el ID
real de transacción de Wompi (transaction.id del webhook), distinto de
providerReferenceId (que es nuestra reference/idempotencyKey).

Cuando un pago es APPROVED pero el stock ya no está disponible (condición
de carrera cubierta desde el diseño original de orders+payments):
1. Se intenta anular la transacción vía POST /v1/transactions/{id}/void
   en la API de Wompi (requiere WOMPI_PRIVATE_KEY).
2. Si el void tiene éxito: Payment.status → REFUNDED.
3. Si el void falla (ej. transacción ya liquidada bancariamente, fuera de
   ventana de anulación): Payment.status → FAILED, se loguea claramente
   como "requiere reembolso MANUAL urgente" — este caso no se puede
   garantizar 100% automático por restricciones del ciclo bancario, está
   fuera de nuestro control total.

Variable de entorno nueva: WOMPI_API_BASE_URL (sandbox: https://sandbox.wompi.co/v1,
producción: https://production.wompi.co/v1).

## Reembolso automático (Wompi Void) — Verificado end-to-end
Probado en sandbox: pago APPROVED con stock insuficiente → void ejecutado
automáticamente vía API de Wompi → Payment.status: REFUNDED,
providerTransactionId guardado correctamente, Order.status: CANCELLED.
Confirmado también del lado de Wompi (dashboard de transacciones muestra
la transacción anulada). Sin necesidad de log de "reembolso manual" en
este caso — el void tuvo éxito en el primer intento.

## Deuda técnica consciente (no bloqueante)
- Order.shippingAddressId es referencia a Address, NO es snapshot (a
  diferencia de OrderItem). Si el usuario edita su dirección después de
  comprar, el historial de la orden reflejaría el cambio retroactivamente.
  Mejora pendiente antes de producción real: copiar los campos de dirección
  directamente en Order en el momento de la compra.

## Deuda técnica — Snapshot de dirección en Order — RESUELTO
Order ahora guarda snapshot completo de la dirección de envío al momento
de la compra (shippingFullName, shippingPhone, shippingLine1, shippingLine2,
shippingCity, shippingState, shippingCountry, shippingPostalCode — todos
NOT NULL excepto Line2 y PostalCode). shippingAddressId se mantiene como
referencia, pero el snapshot es la fuente de verdad para mostrar/facturar
— nunca leer desde la relación order.shippingAddress.

Se limpiaron todas las órdenes/payments/orderItems de prueba antes de la
migración (eran solo datos desechables, no había necesidad de preservarlos
ni de campos nullable por compatibilidad retroactiva).

18/18 tests automatizados siguen pasando tras el cambio — confirma que la
suite de testing (fase 1) está cumpliendo su propósito de proteger contra
regresiones en cambios de lógica de negocio.

## Testing
- Unit tests: mockear repositories, testear services en aislamiento.
- Los repositories no se testean con mocks de Prisma — se testean contra la DB de
  test real (o se cubren indirectamente vía tests de integración).
- Checkout/pagos requieren tests de integración cuidadosos (es la parte más
  sensible del sistema).

## Testing automatizado — Fase 1 (unitarios)
Vitest configurado. Tests unitarios de orders y payments implementados,
mockeando repositories (sin DB real) — cubren los casos críticos de negocio
ya validados manualmente: idempotencia, validación de stock, snapshot de
OrderItems, los 3 escenarios de webhook de pago (aprobado, declinado,
aprobado-sin-stock con void automático).
Comando: npm test (una vez) / npm run test:watch (modo watch).
PENDIENTE: tests de integración contra DB de test real (fase 2, no
implementada aún) para cart, products, categories, addresses, auth.

## Testing automatizado — Fase 1 (unitarios) — COMPLETADO
18/18 tests pasando. Cobertura:
- OrderServiceImpl (7 tests): carrito vacío, ownership de address, validación
  de stock, idempotencia, snapshot correcto, ownership en getMyOrderById.
- PaymentServiceImpl (11 tests): ownership/status de checkout, reutilización
  de Payment existente, cálculo de signature, validación de checksum,
  idempotencia de webhook, los 3 escenarios de pago (aprobado, declinado,
  aprobado-sin-stock con void exitoso/fallido).
Comando: npm test.

## Testing automatizado — Fase 1 COMPLETADA (67/67 tests)
Cobertura completa de lógica de negocio (services) en todos los módulos,
mockeando repositories, sin dependencia de base de datos real:
- orders (7) + payments (11)
- auth (10)
- products (7) + variants (9)
- categories (8)
- cart (8)
- addresses (7)

Comando: npm test (una vez) / npm run test:watch (modo desarrollo).

PENDIENTE (fase 2, no bloqueante): tests de integración contra DB de test
real — validarían la capa de Repository/Prisma en sí (queries, constraints,
transacciones), que hoy solo están cubiertas por el testing manual ya
realizado. No es urgente: los services (la lógica de negocio más
propensa a bugs sutiles) ya están protegidos.

## Testing automatizado — 92/92 tests pasando (conteo corregido)
[Nota: el conteo anterior en este archivo estaba desactualizado — se
detectó y corrigió el 01/08/2026]

## Panel de administración — COMPLETADO (Fases A, B, C)
- Fase A: gestión de órdenes (listado/detalle sin ownership, progresión
  manual de estado PAID→PROCESSING→SHIPPED→DELIVERED).
- Fase B: catálogo admin (productos/categorías incluyendo inactivos).
- Fase C: listado de usuarios (solo lectura, sin edición de rol por
  ahora) + dashboard de métricas (totalOrders, totalRevenue desde
  PAID en adelante, ordersByStatus, totalCustomers, lowStockVariants
  con LOW_STOCK_THRESHOLD=5).

Todas las rutas admin siguen el patrón /admin/all o /admin/:id/acción,
declaradas ANTES de las rutas dinámicas :id/:slug para evitar colisión
de rutas en Express (lección aprendida en Fase A de orders).

105/105 tests pasando. Probado manualmente end-to-end.

PENDIENTE consciente (no bloqueante): edición/eliminación de usuarios
desde admin (cambio de rol, desactivación de cuenta) — decisión de
diseño que merece su propio análisis de seguridad antes de implementar,
no se resolvió aquí a propósito.

## HTTP client compartido (timeout + retry) — COMPLETADO Y VERIFICADO
Todas las llamadas salientes a proveedores externos (Wompi, Envia.com)
usan `fetchWithRetry` de `src/shared/utils/httpClient.ts` en lugar de
`fetch` crudo. Todo el tráfico externo pasa por este helper (verificado
con grep: el único `await fetch(` restante está dentro del helper).

Comportamiento:
- Timeout por petición via AbortController (default 10s, configurable).
- Reintenta únicamente errores transitorios: fallos de red/timeout y
  respuestas 5xx, con backoff exponencial (baseDelayMs * 2^attempt).
- Los 4xx son deterministas: se devuelven tal cual, sin reintentar.
- Si agota los intentos sin obtener respuesta, lanza `HttpRequestError`.
- No introduce comentarios/emojis: solo lógica.

Configuración usada por cada cliente:
- Wompi `voidWompiTransaction`: timeout 10s, 2 reintentos (3 intentos).
- Envia `getShippingRate`: timeout 8s, 1 reintento (2 intentos).
- Envia `generateShippingLabel`: timeout 8s, 0 reintentos — corre dentro
  del webhook de pago, que no puede esperar demasiado; si falla ya existe
  el fallback de "generación de guía fallida" para intervención manual.

Cobertura (14 tests nuevos en tests/unit/shared/): timeout con abort,
reintentos ante 5xx/errores de red, no-reintento de 4xx, agotamiento de
intentos con HttpRequestError, y mapeo de respuestas de ambos clientes.

## express.static(public/) removido — COMPLETADO
`src/app.ts` ya no sirve `test-checkout.html` públicamente (antes con
`app.use(express.static(join(__dirname, "../public")))`). Era una página
de prueba manual para el checkout de Wompi que quedó expuesta como
superficie de ataque; cumplió su propósito (TODO marcado en el código).

Cambios:
- Eliminada la línea de `express.static` + el comentario TODO en app.ts.
- Eliminados imports/variables que quedaron sin uso (`fileURLToPath`,
  `dirname`, `join`, `__filename`, `__dirname`).
- Eliminado el archivo `public/test-checkout.html` (y el directorio
  `public/`, que solo lo contenía). El frontend real del checkout
  (Next.js/BFF) construirá el formulario de Wompi por sí mismo; el
  backend expone los datos vía POST /api/orders/:orderId/checkout.

141/141 tests pasando, typecheck limpio.

## Webhook no bloquea en generación de guía Envia — COMPLETADO
La generación de la guía de envío ya NO se ejecuta inline dentro del
webhook de Wompi (antes bloqueaba la respuesta 200 hasta que Envia
respondiera, con riesgo de que Wompi reintentara 3 veces en 24h).

Implementación: cola de jobs en proceso (`src/shared/utils/jobQueue.ts`),
una `InMemoryJobQueue` detrás de la interfaz `JobQueue` con API mínima
(`schedule` fire-and-forget, `drain` para graceful shutdown). El webhook
APPROVED encola el job `shipping-label:<orderId>` y responde 200 al
instante; el worker procesa la guía en background con el timeout ya
existente (8s, 0 reintentos). Si falla, se mantiene el fallback de
"GENERACIÓN DE GUÍA FALLIDA" para intervención manual.

Inyección: `PaymentServiceImpl` recibe `JobQueue` como 6º parámetro con
default al singleton compartido `jobQueue`. La interfaz permite cambiar a
BullMQ/Redis en producción sin tocar los callers.

Deuda técnica consciente: la cola en proceso no sobrevive un reinicio del
proceso — si el server muere entre el encolado y el procesamiento, la
guía no se genera y hay que hacerlo manual (mismo fallback actual). Para
producción real, swap a una cola persistente (BullMQ + Redis) detrás de
la misma interfaz.

Cobertura: 5 tests nuevos de InMemoryJobQueue (no-bloqueo, FIFO, error no
detiene la cola, drain) + 1 test en payments que verifica que el webhook
resuelve ANTES de que la guía termine (job asíncrono) y que tras drain la
guía se generó y persistió. 147/147 tests pasando, typecheck limpio.

## Transacciones incompletas (webhook y rotación de refresh) — COMPLETADO
Dos puntos donde la atomicidad quedaba partida entre dos operaciones y un
proceso muerto a mitad de camino dejaba estados inconsistentes:

1. **Webhook APPROVED de Wompi**: `updateStatus(Payment SUCCEEDED)` y el
   vaciado del carrito (`clearCart`) quedaban FUERA de la `$transaction`
   que ya protegía Order→PAID + descuento de stock. Si el proceso moría
   entre la transacción y esas llamadas, la orden quedaba PAID con el
   pago aún PENDING y el carrito sin vaciar.
   - Ahora `tryTransitionToPaid` → decremento de stock → Payment
     SUCCEEDED → findOrCreate del carrito → clearCart ocurren DENTRO de
     la misma `runTransaction` (con `tx` pasado a cada repo).
   - `PaymentRepository.updateStatus(id, status, tx?)` y
     `CartRepository.findOrCreateByUserId(userId, tx?)` /
     `clearCart(cartId, tx?)` ahora aceptan `Prisma.TransactionClient`
     opcional (`client = tx ?? this.prisma`), mismo patrón que ya tenía
     `OrderRepository`.
   - El camino de stock insuficiente (CANCELLED + void + REFUNDED/FAILED)
     sigue fuera de la transacción a propósito: es el rollback posterior a
     un fallo, no necesita ser atómico con el intento fallido.

2. **Rotación de refresh tokens**: `create` del token nuevo y `revoke` del
   usado eran dos queries separadas en `auth.service.ts`. Si el proceso
   moría entre ambas, el token viejo quedaba válido (rotación rota, dos
   tokens vivos) o el nuevo se creaba sin revocar el anterior.
   - Nuevo método `RefreshTokenRepository.rotate(oldTokenId, data)` que
     ejecuta `prisma.$transaction`: crea el token nuevo y revoca el viejo
     con `replacedByTokenId` en una sola transacción atómica.
   - `AuthServiceImpl.refresh` ya no llama a `create`+`revoke` por
     separado — usa `rotate`. Los tests verifican que `create`/`revoke`
     ya no se invocan y que `rotate` recibe el hash y la expiración
     correctos.

147/147 tests pasando, typecheck limpio.

## Estado de guía de envío persistente (shippingStatus) — COMPLETADO
Antes, si la generación de la guía fallaba, solo quedaba un `console.error`
("GENERACIÓN DE GUÍA FALLIDA") — el estado no sobrevivía al proceso y no
era visible para el admin. Ahora Order persiste su estado de guía:

- Nuevo enum `ShippingStatus { PENDING, LABEL_GENERATED, LABEL_FAILED }`
  y campo `Order.shippingStatus` con default `PENDING` (migración
  `add_shipping_status`, cliente Prisma regenerado manualmente — issue
  conocido de este proyecto).
- `OrderRepository.updateShippingLabel` ahora además fija
  `shippingStatus: LABEL_GENERATED`. Nuevo método
  `OrderRepository.markShippingLabelFailed(orderId)` fija `LABEL_FAILED`.
- El job `shipping-label:<orderId>` (cola en proceso) llama a
  `markShippingLabelFailed` en el fallo, conservando el `console.error`
  para la intervención manual desde Envia.com.
- El fallo NO cambia el status de la orden (sigue PAID — el pago ya fue
  confirmado) ni revierte nada: solo persiste el estado de la guía.
- Expuesto en `OrderDetailDTO.shippingStatus`.

147/147 tests pasando, typecheck limpio.

## Fix: TDZ en default de JobQueue (shadowing de parámetro) — COMPLETADO
`PaymentServiceImpl` declaraba `private readonly jobQueue: JobQueue = jobQueue`:
el parámetro se llama igual que el import, así que el default `= jobQueue` se
resolvía al PROPIO parámetro (en TDZ mientras evalúa su default) y no al
singleton importado → `ReferenceError: Cannot access 'jobQueue' before
initialization` al arrancar el servidor (order.routes.ts instancia el service
sin el 6º argumento). Los tests no lo detectaban porque siempre inyectaban la
cola explícitamente.

Fix: alias del import (`import { jobQueue as sharedJobQueue }`) para que el
default apunte al binding del módulo. Test de regresión nuevo: construye el
service sin inyectar la cola y verifica que no lance. 149/149 tests pasando,
typecheck limpio, server boot verificado (levanta en localhost:3000).

## Graceful shutdown (mejora #13) — COMPLETADO
Nuevo `src/shared/utils/gracefulShutdown.ts`: `createGracefulShutdown(targets,
options)` devuelve un handler de señal con orden estricto:

1. `closeServer()` — deja de aceptar conexiones nuevas y espera las en vuelo
   (`server.close`).
2. `drainJobs()` — drena la cola de jobs en proceso (`jobQueue.drain`): las
   guías de envío pendientes terminan antes de cortar la DB.
3. `disconnectDb()` — `prisma.$disconnect()` (cierra el pool de pg).

Extras: idempotente (una segunda señal no repite el cierre), timeout de
fuerza bruta (default 10s, timer `.unref()` para no mantener vivo el proceso)
→ salida forzada con código 1, y ante error en cualquier fase sale con 1 sin
seguir con las siguientes. `server.ts` registra `SIGINT`/`SIGTERM` al arrancar.

4 tests nuevos (orden de fases, idempotencia, fallo de fase → exit 1,
timeout forzado). 153/153 tests pasando, typecheck limpio, server boot
verificado. Nota: la señal SIGTERM no se probó de forma nativa en Windows
(las señales son limitadas ahí) — la lógica queda cubierta por unit tests.

## Duplicación de Express.Request.user eliminada (mejora #14) — COMPLETADO
`Express.Request.user` estaba declarada en DOS archivos, con tipos
distintos, y TypeScript las fusionaba en `user?: AuthUser | AuthenticatedUser`:

- `src/shared/types/express.d.ts`: `AuthUser` (role: `Role` de Prisma) —
  la única que se usa, la consume `authMiddleware`.
- `src/shared/types/api-response.ts`: `AuthenticatedUser` (role literal
  `'CUSTOMER' | 'ADMIN'`) + su propio `declare global` — tipo MUERTO,
  nadie lo importaba.

Se eliminó la interfaz `AuthenticatedUser` y su `declare global` de
`api-response.ts` (ahí queda solo `ApiResponse`). `express.d.ts` es la
única fuente de verdad para `req.user`. 153/153 tests pasando, typecheck
limpio.

## Composition root (wiring centralizado, mejora #15) — COMPLETADO
El wiring de dependencias vivía dentro de cada archivo de rutas, y el peor
caso era `PaymentServiceImpl` + `PaymentController` instanciados DOS veces
(en `order.routes.ts` para /checkout y en `payment.routes.ts` para /webhook),
con sus repositories duplicados también.

Nuevo `src/di/container.ts`: composition root único que crea UNA vez todos
los repositories, services y controllers (transacciones cableadas a
`prisma.$transaction`), y exporta `container` con los 9 controllers.

Cada `*.routes.ts` ahora solo importa sus controllers desde el container
(`const { orderController, paymentController } = container;`) y define
rutas/middlewares — el wiring desapareció de las rutas. Beneficio extra:
una sola instancia de cada service (estado compartido, sin duplicados) y
las rutas quedan declarativas. 153/153 tests pasando, typecheck limpio,
server boot verificado (localhost:3000).

## Paginación consistente (mejora #16) — COMPLETADO
Todos los endpoints paginados usan el MISMO shape de respuesta:
`data: { items, total, page, limit }`.

Antes cada listado devolvía algo distinto:
- GET /orders (usuario): `{ items, total, page, limit }` — el shape de
  referencia.
- GET /products (público): `{ items, total, page }` — le faltaba `limit`.
- GET /products/admin/all, GET /categories/admin/all, GET /auth/admin/all,
  GET /orders/admin/all: devolvían SOLO `items` (tiraban `total`/`page`/`limit`
  aunque paginaban en el server).

Ahora los 5 listados (products público, products admin, categories admin,
orders admin, auth admin) + GET /orders construyen el envelope
`{ items, total, page, limit }` en el controller — `page`/`limit` vienen del
query (default 1/20 por el schema Zod), `total` del service. La forma de la
respuesta ya no depende del endpoint que se consuma. 153/153 tests pasando,
typecheck limpio.

## Logging estructurado + request logging (mejora #17) — COMPLETADO
Todos los `console.log/error/warn` dispersos fueron reemplazados por **pino**
(logs JSON estructurados) y se agregó **request logging con request-id**
(pino-http), con correlación webhook→order.

- `src/shared/utils/logger.ts`: singleton `logger` de pino + `requestLogger`
  middleware de pino-http. `resolveLogLevel()`: `NODE_ENV=test` → `silent`,
  `LOG_LEVEL` si se define, default `info`. En `NODE_ENV=development` usa el
  transport de `pino-pretty` (si `.env` no define NODE_ENV, los logs salen en
  JSON crudo — igualmente parseable).
- `requestLogger` asignado en `app.ts` ANTES de cualquier ruta: genera/expone
  `X-Request-Id` (reutiliza el header entrante si viene del cliente) e incluye
  `req.id` en cada log de request (método, url, status, responseTime). `/health`
  se ignora en el autoLogging. Cada respuesta HTTP lleva su `X-Request-Id` para
  correlación con los logs del servidor.
- **Correlación webhook→order**: `PaymentService.processWebhookEvent(rawEvent,
  reqId?)` recibe el `req.id` desde el controller del webhook, y TODOS los logs
  del procesamiento llevan `{ reqId, transactionId, reference, paymentId,
  orderId }` — se puede seguir un evento de Wompi desde el request del webhook
  hasta la orden afectada (APPROVED, stock insuficiente con void, guía fallida,
  rechazos, desconocido). `errorHandler` loguea con `reqId`.
- Reemplazados: `server.ts` (boot), `env.ts` (errores de validación), `errorHandler`
  (unhandled), `shippingClient.ts` (warnings de cotización con carrier/status),
  `jobQueue.ts` (jobs fallidos con jobId), `auth.service.ts` (fallo de email),
  `payment.service.ts` (todos los eventos del webhook).
- Tests: los spies pasaron de `console.*` a `logger.*` (shippingClient, jobQueue,
  payments, auth, errorHandler). 4 tests nuevos de `resolveLogLevel` + 3 tests de
  `requestLogger` (generación/preservación del X-Request-Id). Verificado en vivo:
  boot con JSON estructurado y request log con `req.id` preservado del header.
  160/160 tests pasando, typecheck limpio.

## JWT hardening (mejora #18) — COMPLETADO
- **issuer/audience**: `signToken` (auth.service.ts) firma los access tokens con
  `issuer` y `audience` (envs `JWT_ISSUER` default `hallyboutique-api`,
  `JWT_AUDIENCE` default `hallyboutique-web`, en env.ts). `authMiddleware`
  verifica AMBOS en `verify` — un token sin issuer/audience, o con valores
  distintos, se rechaza con 401. Verificado end-to-end en vivo (register → /me
  con token firmado, token corrupto → 401).
- **`as string` eliminado**: `authMiddleware` ya no castea `env.JWT_SECRET as
  string` (el schema de env.ts ya garantiza `string` en runtime y tipo).
- **`jti` (claim nuevo)**: cada access token lleva `jti: randomUUID()` — deja el
  gancho para una blocklist futura (p.ej. Redis) sin costo hoy.
- **Invalidación de access token al rotar — DECISIÓN DOCUMENTADA (no
  implementada)**: los access tokens son JWT stateless de 15 min a propósito; NO
  se invalidan al rotar el refresh. Razones: (1) invalidarlos requeriría una
  blocklist (jti + Redis) con round-trip a DB/cache por request, negando el
  beneficio de JWT stateless; (2) el escenario de token robado ya está cubierto
  por la detección de reuso del refresh (revoca TODOS los refresh tokens del
  usuario) y el reset de password (revoca todos los refresh); el access token
  expira en ≤15 min. Si en producción se necesita invalidación instantánea, el
  camino es blocklist de `jti` en Redis.
- Nota: los tokens emitidos ANTES de este cambio quedan inválidos (no traen
  issuer/audience) — aceptable, expiran en 15 min.
- Tests: 6 tests nuevos de `authMiddleware` (token válido con issuer/audience →
  req.user; sin issuer/audience → 401; issuer incorrecto → 401; audience
  incorrecta → 401; sin header → 401; header sin formato Bearer → 401).
  166/166 tests pasando, typecheck limpio.

## Documentación OpenAPI/Swagger (mejora #19) — COMPLETADO
- `src/docs/openapi.ts`: documento OpenAPI 3.0.3 completo tipado con
  `oas30.OpenAPIObject` de `openapi3-ts` (v4 exporta namespaces `oas30`/`oas31`/
  `oas32`, NO un `OpenAPIObject` en la raíz). Cubre todos los endpoints (auth,
  products+variants+imágenes, categories, cart, addresses, orders incl. admin,
  payments webhook, metrics) y `components.schemas` con todos los DTOs.
- Helpers internos: `successResponse(ref)`, `emptySuccessResponse()` y
  `errorResponse`; `security` global `bearerAuth` con `security: []` en los
  públicos (health, listados de catálogo).
- Rutas (en app.ts, montadas SOLO fuera de producción):
  - `GET /api/docs` — Swagger UI (swagger-ui-express).
  - `GET /api/docs.json` — el documento crudo.
- Notas de compatibilidad OpenAPI 3.0: `exclusiveMinimum` es booleano (la forma
  numérica es de 3.1), así que `basePrice` usa `exclusiveMinimum: true +
  minimum: 0`.
- Verificado en vivo: boot OK, `/api/docs` y `/api/docs.json` responden 200 con
  el documento válido (todos los paths operativos, sin claves duplicadas).
  166/166 tests pasando, typecheck limpio.

## .env.example versionable (mejora #20) — COMPLETADO
- Nuevo `.env.example` con TODAS las variables reales de `src/config/env.ts`
  (verificado programáticamente: cobertura 1:1, sin faltantes ni extras).
- Comentarios en español con instrucciones para obtener cada secreto (JWT con
  `openssl rand -hex 64`, llaves de Wompi sandbox con prefijo `_test_`, Envia.com
  sandbox, origen de envío) y los defaults razonables (puerto, CORS, TAX_RATE,
  FREE_SHIPPING_THRESHOLD, carriers).
- `STRIPE_SECRET_KEY`/`STRIPE_WEBHOOK_SECRET` quedan FUERA a propósito: son
  opcionales y muertas (Wompi reemplazó a Stripe) — no generan fricción de
  onboarding.
- `.env` sigue gitignoreado (verificado) — `.env.example` es la única referencia
  versionable. Proceso: copiar a `.env` y llenar.

## Estado actual del proyecto (actualizado)

- [x] Schema de Prisma completo y migrado
- [x] Middlewares base
- [x] Módulo auth — probado
- [x] Módulo products + variants — probado
- [x] Módulo categories — probado
- [x] Módulo cart — probado
- [x] Módulo addresses — probado
- [x] Módulo orders — probado
- [x] Módulo payments (Wompi) — FLUJO COMPLETO VERIFICADO END-TO-END en
      sandbox: checkout generado, pago aprobado en Wompi, webhook recibido
      y procesado, Order → PAID, Payment → SUCCEEDED, stock descontado,
      carrito vaciado. Hito principal del proyecto alcanzado.

## Regla operativa importante
Nunca borrar filas directamente desde pgAdmin/Prisma Studio en tablas de
negocio (products, orders, etc.) — rompe soft delete y trazabilidad. Esas
herramientas son solo para consultar y para poblar datos semilla iniciales
(ej. categorías). Todo cambio de estado real debe pasar por la API.

## Convención de commits
Conventional Commits (`feat:`, `fix:`, `refactor:`, `test:`, `docs:`).