import * as Sentry from "@sentry/node";

const dsn = process.env.SENTRY_DSN;

if (!dsn) {
  console.log("[Sentry] Deshabilitado — SENTRY_DSN no configurada");
}

Sentry.init({
  dsn,
  environment: process.env.NODE_ENV,
});
