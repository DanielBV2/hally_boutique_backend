import type { Request, Response, NextFunction } from "express";
import jsonwebtoken from "jsonwebtoken";
import { env } from "../config/env.js";
import { UnauthorizedError } from "../shared/errors/app-error.js";
import type { AuthUser } from "../shared/types/express.d.js";

const { verify } = jsonwebtoken;

interface JwtPayload {
  sub: string;
  email: string;
  role: string;
}

export function authMiddleware(
  req: Request,
  _res: Response,
  next: NextFunction,
): void {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    next(new UnauthorizedError("Missing or invalid authorization header"));
    return;
  }

  const parts = authHeader.split(" ");
  const token = parts[1];

  if (!token) {
    next(new UnauthorizedError("Missing or invalid authorization header"));
    return;
  }

  try {
    const decoded = verify(token, env.JWT_SECRET as string) as unknown as JwtPayload;

    const user: AuthUser = {
      id: decoded.sub,
      email: decoded.email,
      role: decoded.role as AuthUser["role"],
    };

    req.user = user;
    next();
  } catch {
    next(new UnauthorizedError("Invalid or expired token"));
  }
}
