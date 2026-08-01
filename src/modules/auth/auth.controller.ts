import type { Request, Response } from "express";
import type { AuthService } from "./auth.service.js";
import type {
  RegisterInput,
  LoginInput,
  RefreshTokenInput,
  AdminUsersQuery,
} from "./auth.schema.js";
import type { ApiResponse } from "../../shared/types/api-response.js";

export class AuthController {
  constructor(private readonly service: AuthService) {}

  register = async (req: Request, res: Response) => {
    const data = req.body as RegisterInput;
    const result = await this.service.register(data);

    const body: ApiResponse<typeof result> = { success: true, data: result };
    res.status(201).json(body);
  };

  login = async (req: Request, res: Response) => {
    const data = req.body as LoginInput;
    const result = await this.service.login(data);

    const body: ApiResponse<typeof result> = { success: true, data: result };
    res.status(200).json(body);
  };

  getProfile = async (req: Request, res: Response) => {
    const userId = req.user!.id;
    const result = await this.service.getProfile(userId);

    const body: ApiResponse<typeof result> = { success: true, data: result };
    res.status(200).json(body);
  };

  refresh = async (req: Request, res: Response) => {
    const { refreshToken } = req.body as RefreshTokenInput;
    const result = await this.service.refresh(refreshToken);

    const body: ApiResponse<typeof result> = { success: true, data: result };
    res.status(200).json(body);
  };

  logout = async (req: Request, res: Response) => {
    const { refreshToken } = req.body as RefreshTokenInput;
    await this.service.logout(refreshToken);

    const body: ApiResponse<null> = { success: true, data: null };
    res.status(200).json(body);
  };

  listUsersAdmin = async (req: Request, res: Response) => {
    const query = req.query as unknown as AdminUsersQuery;
    const filters = query.role ? { role: query.role } : {};
    const result = await this.service.listUsersAdmin(filters, {
      page: query.page,
      limit: query.limit,
    });

    const body: ApiResponse<typeof result.items> = {
      success: true,
      data: result.items,
    };
    res.status(200).json(body);
  };
}
