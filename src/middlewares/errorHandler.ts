import type { Request, Response, NextFunction } from "express";
import { AppError } from "../shared/errors/app-error.js";
import type { ApiResponse } from "../shared/types/api-response.js";

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

  console.error("Unhandled error:", err);

  const body: ApiResponse<never> = {
    success: false,
    error: { code: "INTERNAL_ERROR", message: "Internal server error" },
  };
  res.status(500).json(body);
}
