import type { Request, Response } from "express";
import type { MetricsService } from "./metrics.service.js";
import type { ApiResponse } from "../../shared/types/api-response.js";

export class MetricsController {
  constructor(private readonly service: MetricsService) {}

  getDashboard = async (_req: Request, res: Response) => {
    const metrics = await this.service.getDashboardMetrics();

    const body: ApiResponse<typeof metrics> = { success: true, data: metrics };
    res.status(200).json(body);
  };
}
