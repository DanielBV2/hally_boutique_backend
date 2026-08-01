import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  MetricsServiceImpl,
  LOW_STOCK_THRESHOLD,
} from "../../../src/modules/metrics/metrics.service.js";
import type { MetricsRepository } from "../../../src/modules/metrics/metrics.repository.js";

function mockMetricsRepo(): MetricsRepository {
  return {
    countOrdersByStatus: vi.fn(),
    sumRevenueFromPaidOrders: vi.fn(),
    countCustomers: vi.fn(),
    findLowStockVariants: vi.fn(),
  };
}

describe("MetricsServiceImpl", () => {
  let metricsRepo: ReturnType<typeof mockMetricsRepo>;
  let service: MetricsServiceImpl;

  beforeEach(() => {
    vi.clearAllMocks();
    metricsRepo = mockMetricsRepo();
    service = new MetricsServiceImpl(metricsRepo);
  });

  it("arma totalOrders sumando todos los valores de ordersByStatus", async () => {
    vi.mocked(metricsRepo.countOrdersByStatus).mockResolvedValue({
      PENDING: 3,
      PAID: 5,
      PROCESSING: 2,
      SHIPPED: 1,
      DELIVERED: 4,
      CANCELLED: 1,
      REFUNDED: 0,
    });
    vi.mocked(metricsRepo.sumRevenueFromPaidOrders).mockResolvedValue(1250000);
    vi.mocked(metricsRepo.countCustomers).mockResolvedValue(42);
    vi.mocked(metricsRepo.findLowStockVariants).mockResolvedValue([
      {
        id: "variant-1",
        productName: "Camiseta Basica",
        size: "S",
        color: "Blanco",
        stock: 2,
      },
    ]);

    const result = await service.getDashboardMetrics();

    expect(result.totalOrders).toBe(16);
    expect(result.totalRevenue).toBe(1250000);
    expect(result.totalCustomers).toBe(42);
    expect(result.ordersByStatus).toMatchObject({
      PENDING: 3,
      PAID: 5,
      PROCESSING: 2,
      SHIPPED: 1,
      DELIVERED: 4,
      CANCELLED: 1,
      REFUNDED: 0,
    });
    expect(result.lowStockVariants).toHaveLength(1);
    expect(result.lowStockVariants[0]).toMatchObject({
      id: "variant-1",
      productName: "Camiseta Basica",
      size: "S",
      color: "Blanco",
      stock: 2,
    });
  });

  it("llama findLowStockVariants con LOW_STOCK_THRESHOLD (5)", async () => {
    vi.mocked(metricsRepo.countOrdersByStatus).mockResolvedValue({});
    vi.mocked(metricsRepo.sumRevenueFromPaidOrders).mockResolvedValue(0);
    vi.mocked(metricsRepo.countCustomers).mockResolvedValue(0);
    vi.mocked(metricsRepo.findLowStockVariants).mockResolvedValue([]);

    await service.getDashboardMetrics();

    expect(metricsRepo.findLowStockVariants).toHaveBeenCalledWith(
      LOW_STOCK_THRESHOLD,
    );
    expect(metricsRepo.findLowStockVariants).toHaveBeenCalledWith(5);
  });

  it("totalOrders es 0 cuando no hay órdenes en ningún estado", async () => {
    vi.mocked(metricsRepo.countOrdersByStatus).mockResolvedValue({});
    vi.mocked(metricsRepo.sumRevenueFromPaidOrders).mockResolvedValue(0);
    vi.mocked(metricsRepo.countCustomers).mockResolvedValue(0);
    vi.mocked(metricsRepo.findLowStockVariants).mockResolvedValue([]);

    const result = await service.getDashboardMetrics();

    expect(result.totalOrders).toBe(0);
    expect(result.totalRevenue).toBe(0);
    expect(result.totalCustomers).toBe(0);
    expect(result.lowStockVariants).toEqual([]);
  });

  it("ejecuta los 4 métodos del repository en paralelo", async () => {
    vi.mocked(metricsRepo.countOrdersByStatus).mockResolvedValue({});
    vi.mocked(metricsRepo.sumRevenueFromPaidOrders).mockResolvedValue(0);
    vi.mocked(metricsRepo.countCustomers).mockResolvedValue(0);
    vi.mocked(metricsRepo.findLowStockVariants).mockResolvedValue([]);

    await service.getDashboardMetrics();

    expect(metricsRepo.countOrdersByStatus).toHaveBeenCalledOnce();
    expect(metricsRepo.sumRevenueFromPaidOrders).toHaveBeenCalledOnce();
    expect(metricsRepo.countCustomers).toHaveBeenCalledOnce();
    expect(metricsRepo.findLowStockVariants).toHaveBeenCalledOnce();
  });
});
