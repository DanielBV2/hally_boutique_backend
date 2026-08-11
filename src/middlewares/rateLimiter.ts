import { rateLimit } from "express-rate-limit";
import type { ApiResponse } from "../shared/types/api-response.js";

// Nota para producción: si el servidor corre detrás de un proxy/balanceador
// (nginx, Cloudflare, ELB...), hay que configurar `app.set("trust proxy", 1)`
// (o el valor correcto según la cadena de proxies) para que el rate limiting
// use la IP real del cliente y no la del proxy.

interface LimiterOptions {
  windowMs: number;
  limit: number;
  message: string;
  skip?: (req: { originalUrl: string }) => boolean;
}

function rateLimitError(message: string): ApiResponse<never> {
  return {
    success: false,
    error: { code: "RATE_LIMITED", message },
  };
}

function buildLimiter(options: LimiterOptions) {
  return rateLimit({
    windowMs: options.windowMs,
    limit: options.limit,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    ...(options.skip !== undefined && { skip: options.skip }),
    handler: (_req, res) => {
      res.status(429).json(rateLimitError(options.message));
    },
  });
}

export function createApiLimiter() {
  return buildLimiter({
    windowMs: 15 * 60 * 1000,
    limit: 300,
    message: "Demasiadas peticiones. Intenta de nuevo más tarde.",
    // Los webhooks de Wompi llegan de servidor a servidor y con reintentos
    // muy espaciados (máx. 3 en 24h) — nunca deben ser limitados por IP.
    skip: (req) => req.originalUrl.endsWith("/payments/webhook"),
  });
}

export function createLoginLimiter() {
  return buildLimiter({
    windowMs: 60 * 1000,
    limit: 10,
    message:
      "Demasiados intentos de inicio de sesión. Intenta de nuevo en un minuto.",
  });
}

export function createRegisterLimiter() {
  return buildLimiter({
    windowMs: 60 * 60 * 1000,
    limit: 10,
    message: "Demasiados intentos de registro. Intenta de nuevo más tarde.",
  });
}

export function createForgotPasswordLimiter() {
  return buildLimiter({
    windowMs: 60 * 60 * 1000,
    limit: 5,
    message:
      "Demasiadas solicitudes de recuperación de contraseña. Intenta de nuevo más tarde.",
  });
}

export const apiLimiter = createApiLimiter();
export const loginLimiter = createLoginLimiter();
export const registerLimiter = createRegisterLimiter();
export const forgotPasswordLimiter = createForgotPasswordLimiter();
