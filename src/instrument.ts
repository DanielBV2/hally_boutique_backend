import * as Sentry from "@sentry/node";
import { env } from "./config/env.js";

const dsn = env.SENTRY_DSN;

if (!dsn) {
  console.log("[Sentry] Deshabilitado — SENTRY_DSN no configurada");
} else {
  console.log("[Sentry] Activo");
}

Sentry.init({
  dsn,
  environment: env.NODE_ENV,
});
