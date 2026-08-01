export interface LowStockVariantDTO {
  id: string;
  productName: string;
  size: string;
  color: string;
  stock: number;
}

export interface DashboardMetricsDTO {
  totalOrders: number;
  totalRevenue: number; // suma de total de órdenes PAID/PROCESSING/SHIPPED/DELIVERED
  ordersByStatus: Record<string, number>; // conteo por cada OrderStatus
  totalCustomers: number; // usuarios con role CUSTOMER
  lowStockVariants: LowStockVariantDTO[]; // variantes con stock <= 5, para reabastecer
}
