/*export type ApiResponse<T> =
  | { success: true; data: T }
  | { success: false; error: { code: string; message: string } };

export function successResponse<T>(data: T): ApiResponse<T> {
  return { success: true, data };
}

export function errorResponse(
  code: string,
  message: string,
): ApiResponse<never> {
  return { success: false, error: { code, message } };
}*/

// api-response.ts
export type ApiResponse<T> =
  | { success: true; data: T }
  | { success: false; error: { code: string; message: string; details?: unknown } };

// express.d.ts — extiende Request de Express
export interface AuthenticatedUser {
  id: string;
  email: string;
  role: 'CUSTOMER' | 'ADMIN';
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
    }
  }
}
