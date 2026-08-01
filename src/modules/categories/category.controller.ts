import type { Request, Response } from "express";
import type { CategoryService } from "./category.service.js";
import type { ApiResponse } from "../../shared/types/api-response.js";
import type {
  CreateCategoryInput,
  UpdateCategoryInput,
  AdminCategoriesQuery,
} from "./category.schema.js";

export class CategoryController {
  constructor(private readonly service: CategoryService) {}

  list = async (_req: Request, res: Response) => {
    const categories = await this.service.listActive();

    const body: ApiResponse<typeof categories> = {
      success: true,
      data: categories,
    };
    res.status(200).json(body);
  };

  listAdmin = async (req: Request, res: Response) => {
    const query = req.query as unknown as AdminCategoriesQuery;
    const filters: { isActive?: boolean } = {};
    if (query.isActive !== undefined) filters.isActive = query.isActive;

    const result = await this.service.listCategoriesAdmin(filters, {
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
    const category = await this.service.getBySlug(slug);

    const body: ApiResponse<typeof category> = {
      success: true,
      data: category,
    };
    res.status(200).json(body);
  };

  create = async (req: Request, res: Response) => {
    const data = req.body as CreateCategoryInput;
    const category = await this.service.createCategory(data);

    const body: ApiResponse<typeof category> = {
      success: true,
      data: category,
    };
    res.status(201).json(body);
  };

  update = async (req: Request, res: Response) => {
    const { id } = req.params as { id: string };
    const data = req.body as UpdateCategoryInput;
    const category = await this.service.updateCategory(id, data);

    const body: ApiResponse<typeof category> = {
      success: true,
      data: category,
    };
    res.status(200).json(body);
  };

  remove = async (req: Request, res: Response) => {
    const { id } = req.params as { id: string };
    await this.service.deleteCategory(id);

    const body: ApiResponse<null> = { success: true, data: null };
    res.status(200).json(body);
  };
}
