import type { Request, Response } from "express";
import type { ListProductsQuery, CreateProductInput, UpdateProductInput, AddProductImageInput } from "./product.schema.js";
import * as productService from "./product.service.js";

// Helper to safely extract a single string param from Express 5 params
function param(req: Request, key: string): string {
  const val = req.params[key];
  return Array.isArray(val) ? val[0]! : (val ?? "");
}

// ─── GET /products ─────────────────────────────────────────────

export async function listProducts(req: Request, res: Response) {
  const query = req.query as unknown as ListProductsQuery;
  const result = await productService.listProducts(query);
  res.json({ success: true, data: result });
}

// ─── GET /products/:slug ───────────────────────────────────────

export async function getProductBySlug(req: Request, res: Response) {
  const slug = param(req, "slug");
  const product = await productService.getProductBySlug(slug);
  res.json({ success: true, data: product });
}

// ─── POST /products ────────────────────────────────────────────

export async function createProduct(req: Request, res: Response) {
  const input = req.body as CreateProductInput;
  const product = await productService.createProduct(input);
  res.status(201).json({ success: true, data: product });
}

// ─── PATCH /products/:id ───────────────────────────────────────

export async function updateProduct(req: Request, res: Response) {
  const id = param(req, "id");
  const input = req.body as UpdateProductInput;
  const product = await productService.updateProduct(id, input);
  res.json({ success: true, data: product });
}

// ─── DELETE /products/:id ──────────────────────────────────────

export async function deleteProduct(req: Request, res: Response) {
  const id = param(req, "id");
  await productService.deleteProduct(id);
  res.status(204).send();
}

// ─── POST /products/:id/images ─────────────────────────────────

export async function addImage(req: Request, res: Response) {
  const id = param(req, "id");
  const input = req.body as AddProductImageInput;
  const image = await productService.addImage(id, input);
  res.status(201).json({ success: true, data: image });
}

// ─── DELETE /products/:id/images/:imageId ──────────────────────

export async function removeImage(req: Request, res: Response) {
  const id = param(req, "id");
  const imageId = param(req, "imageId");
  await productService.removeImage(id, imageId);
  res.status(204).send();
}
