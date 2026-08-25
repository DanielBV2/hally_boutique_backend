import type { Request, Response, NextFunction } from "express";
import { ForbiddenError, UnauthorizedError } from "../shared/errors/app-error.js";

export function roleMiddleware(...allowedRoles: ('CUSTOMER' | 'ADMIN')[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) throw new UnauthorizedError();
    if (!allowedRoles.includes(req.user.role)) {
      throw new ForbiddenError();
    }
    next();
  };
}