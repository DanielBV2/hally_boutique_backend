# Hally Boutique — Backend

[![CI](https://github.com/DanielBV2/hally_boutique_backend/actions/workflows/ci.yml/badge.svg)](https://github.com/DanielBV2/hally_boutique_backend/actions/workflows/ci.yml)

Backend REST para Hally Boutique, tienda de e-commerce de vestidos de
baño y accesorios.

## Stack

- Node.js + TypeScript, Express 5
- PostgreSQL + Prisma ORM
- Wompi (pagos), Envia.com (envíos), Resend (emails transaccionales)
- Vitest (tests), pino (logging estructurado)
- GitHub Actions (CI)

## Arquitectura

Arquitectura modular por dominios (`src/modules/<dominio>`), con
Repository Pattern y un composition root centralizado en
`src/di/container.ts`.

Módulos: `addresses`, `auth`, `cart`, `categories`, `metrics`,
`orders`, `payments`, `products`, `users`, `variants`.

Las decisiones de diseño y la bitácora completa de mejoras de
producción están documentadas en [CLAUDE.md](./CLAUDE.md).

## Requisitos

- Node.js >= 24
- PostgreSQL (local o remoto)
- Cuentas sandbox de Wompi y Envia.com (opcional si no vas a probar
  pagos o envíos en desarrollo)

## Setup

```bash
git clone https://github.com/DanielBV2/hally_boutique_backend.git
cd hally_boutique_backend
npm install
cp .env.example .env
# completa .env con tus valores — ver sección "Variables de entorno"
npm run prisma:migrate
npm run dev
```

El servidor corre por defecto en `http://localhost:3000`. Documentación
interactiva de la API (Swagger) disponible en
`http://localhost:3000/api/docs`.

## Scripts

| Script | Descripción |
|---|---|
| `npm run dev` | servidor en modo watch (tsx) |
| `npm run build` | compila TypeScript a `dist/` |
| `npm start` | corre el build compilado |
| `npm test` | corre la suite de tests una vez |
| `npm run test:watch` | tests en modo watch |
| `npm run prisma:migrate` | crea/aplica migración en dev + regenera cliente |
| `npm run prisma:migrate:deploy` | aplica migraciones pendientes (producción) |
| `npm run prisma:studio` | abre Prisma Studio (GUI de la base de datos) |

## Variables de entorno

Ver [`.env.example`](./.env.example) para el listado completo con
comentarios. Grupos principales:

- General (`PORT`, `NODE_ENV`)
- Base de datos (`DATABASE_URL`)
- Auth/JWT (secreto, expiraciones, refresh tokens)
- Email vía Resend (`RESEND_API_KEY` es opcional en desarrollo)
- CORS
- Wompi (pagos)
- Envia.com (envíos) + dirección de origen del almacén
- Impuestos y reglas de envío gratis
- Jobs en background (`JOB_POLL_INTERVAL_MS`, `JOB_BATCH_SIZE`)

Todas se validan al arrancar con Zod (`src/config/env.ts`): si falta
alguna variable requerida, el servidor no arranca y el error indica
exactamente cuál falta.

## Testing

Suite de tests unitarios con Vitest — repositories mockeados, sin
dependencia de una base de datos real. Corre automáticamente en CI en
cada push/PR a `main`.

```bash
npm test
```

## CI/CD

`main` está protegido: los cambios se hacen vía Pull Request y
requieren que el check de CI pase antes de poder mergear.

## Licencia

ISC
