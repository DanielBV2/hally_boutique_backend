import type { Request, Response } from "express";
import type { ProductService } from "./product.service.js";
import type { ApiResponse } from "../../shared/types/api-response.js";
import type {
  ListProductsQuery,
  AdminProductsQuery,
  CreateProductInput,
  UpdateProductInput,
  AddProductImageInput,
} from "./product.schema.js";

export class ProductController {
  constructor(private readonly service: ProductService) {}

  list = async (req: Request, res: Response) => {
    const query = req.query as unknown as ListProductsQuery;

    const { items, total, page } = await this.service.listProducts(
      {
        categoryId: query.categoryId,
        search: query.search,
        minPrice: query.minPrice,
        maxPrice: query.maxPrice,
      },
      { page: query.page, limit: query.limit },
      { sortBy: query.sortBy, sortOrder: query.sortOrder },
    );

    const body: ApiResponse<typeof items> = { success: true, data: items };
    res.status(200).json(body);
  };

  listAdmin = async (req: Request, res: Response) => {
    const query = req.query as unknown as AdminProductsQuery;
    const filters: { isActive?: boolean; categoryId?: string } = {};
    if (query.isActive !== undefined) filters.isActive = query.isActive;
    if (query.categoryId !== undefined) filters.categoryId = query.categoryId;

    const result = await this.service.listProductsAdmin(filters, {
      page: query.page,
      limit: query.limit,
    });

    const body: ApiResponse<typeof result.items> = {
      success: true,
      data: result.items,
    };
    res.status(200).json(body);
  };

  getBySlug = async (req: Request, res: Response) => {
    const { slug } = req.params as { slug: string };
    const product = await this.service.getProductBySlug(slug);

    const body: ApiResponse<typeof product> = { success: true, data: product };
    res.status(200).json(body);
  };

  create = async (req: Request, res: Response) => {
    const data = req.body as CreateProductInput;
    const product = await this.service.createProduct(data);

    const body: ApiResponse<typeof product> = { success: true, data: product };
    res.status(201).json(body);
  };

  update = async (req: Request, res: Response) => {
    const { id } = req.params as { id: string };
    const data = req.body as UpdateProductInput;
    const product = await this.service.updateProduct(id, data);

    const body: ApiResponse<typeof product> = { success: true, data: product };
    res.status(200).json(body);
  };

  remove = async (req: Request, res: Response) => {
    const { id } = req.params as { id: string };
    await this.service.deleteProduct(id);

    const body: ApiResponse<null> = { success: true, data: null };
    res.status(200).json(body);
  };

  addImage = async (req: Request, res: Response) => {
    const { id } = req.params as { id: string };
    const data = req.body as AddProductImageInput;
    await this.service.addProductImage(id, data);

    const body: ApiResponse<null> = { success: true, data: null };
    res.status(201).json(body);
  };

  removeImage = async (req: Request, res: Response) => {
    const { id, imageId } = req.params as { id: string; imageId: string };
    await this.service.removeProductImage(id, imageId);

    const body: ApiResponse<null> = { success: true, data: null };
    res.status(200).json(body);
  };
}
