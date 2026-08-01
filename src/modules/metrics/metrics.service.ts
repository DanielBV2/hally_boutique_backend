import type { MetricsRepository } from "./metrics.repository.js";
import type { DashboardMetricsDTO } from "./metrics.dto.js";

export const LOW_STOCK_THRESHOLD = 5;

export interface MetricsService {
  getDashboardMetrics(): Promise<DashboardMetricsDTO>;
}

export class MetricsServiceImpl implements MetricsService {
  constructor(private readonly repository: MetricsRepository) {}

  async getDashboardMetrics(): Promise<DashboardMetricsDTO> {
    const [ordersByStatus, totalRevenue, totalCustomers, lowStockVariants] =
      await Promise.all([
        this.repository.countOrdersByStatus(),
        this.repository.sumRevenueFromPaidOrders(),
        this.repository.countCustomers(),
        this.repository.findLowStockVariants(LOW_STOCK_THRESHOLD),
      ]);

    const totalOrders = Object.values(ordersByStatus).reduce(
      (sum, count) => sum + count,
      0,
    );

    return {
      totalOrders,
      totalRevenue,
      ordersByStatus,
      totalCustomers,
      lowStockVariants,
    };
  }
}
