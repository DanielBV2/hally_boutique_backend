import type { Request, Response, NextFunction } from "express";
import type { ZodSchema } from "zod";
import { ValidationError } from "../shared/errors/app-error.js";

type SchemaTarget = "body" | "params" | "query";

export function validateSchemaMiddleware(schema: ZodSchema, target: SchemaTarget = "body") {
  return (req: Request, _res: Response, next: NextFunction) => {
    const result = schema.safeParse(req[target]);
    if (!result.success) {
      throw new ValidationError("Datos inválidos", result.error.flatten());
    }
    if (target === "query") {
      Object.defineProperty(req, "query", {
        value: result.data,
        writable: true,
        configurable: true,
        enumerable: true,
      });
    } else {
      req[target] = result.data;
    }
    next();
  };
}
