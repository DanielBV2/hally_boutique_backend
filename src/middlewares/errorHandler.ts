import type { Request, Response, NextFunction } from "express";
import { Prisma } from "@prisma/client";
import { AppError } from "../shared/errors/app-error.js";
import type { ApiResponse } from "../shared/types/api-response.js";
import { logger } from "../shared/utils/logger.js";

interface PrismaErrorMapping {
  statusCode: number;
  code: string;
  message: string;
}

function mapPrismaError(
  err: Prisma.PrismaClientKnownRequestError,
): PrismaErrorMapping | null {
  switch (err.code) {
    case "P2002": {
      const target = err.meta?.target;
      const fields = Array.isArray(target)
        ? target.join(", ")
        : target !== undefined
          ? String(target)
          : "";
      return {
        statusCode: 409,
        code: "CONFLICT",
        message: fields
          ? `Ya existe un registro con el mismo valor en: ${fields}`
          : "El recurso ya existe",
      };
    }
    case "P2003":
      return {
        statusCode: 409,
        code: "CONFLICT",
        message: "La operación viola una restricción de datos existente",
      };
    case "P2025":
      return {
        statusCode: 404,
        code: "NOT_FOUND",
        message: "El registro que se intenta modificar no existe",
      };
    default:
      return null;
  }
}

export function errorHandler(
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  if (err instanceof AppError) {
    const body: ApiResponse<never> = {
      success: false,
      error: { code: err.code, message: err.message },
    };
    res.status(err.statusCode).json(body);
    return;
  }

  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    const mapping = mapPrismaError(err);
    if (mapping) {
      const body: ApiResponse<never> = {
        success: false,
        error: { code: mapping.code, message: mapping.message },
      };
      res.status(mapping.statusCode).json(body);
      return;
    }
  }

  logger.error({ err, reqId: _req.id }, "Unhandled error");

  const body: ApiResponse<never> = {
    success: false,
    error: { code: "INTERNAL_ERROR", message: "Internal server error" },
  };
  res.status(500).json(body);
}
