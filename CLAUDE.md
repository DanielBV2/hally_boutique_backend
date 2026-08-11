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

PENDIENTE: remover el logging temporal [DEBUG Envia] de shippingClient.ts
que se agregó para diagnosticar estos bugs (ya cumplió su propósito).

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