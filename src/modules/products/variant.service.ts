import type { VariantRepository } from "./variant.repository.js";
import type { ProductRepository } from "./product.repository.js";
import type { VariantAdminDTO } from "./variant.dto.js";
import type { Prisma, Size } from "@prisma/client";
import { ConflictError, NotFoundError, ValidationError } from "../../shared/errors/app-error.js";
import { generateUniqueSku } from "../../shared/utils/sku.js";

interface CreateVariantInput {
  size: string;
  color: string;
  sku?: string | undefined;
  stock: number;
  priceDelta: number;
}

interface UpdateVariantInput {
  stock?: number | undefined;
  priceDelta?: number | undefined;
  sku?: string | undefined;
  isActive?: boolean | undefined;
}

export interface VariantService {
  listByProduct(productId: string): Promise<VariantAdminDTO[]>;
  createVariant(productId: string, data: CreateVariantInput): Promise<VariantAdminDTO>;
  updateVariant(
    productId: string,
    variantId: string,
    data: UpdateVariantInput,
    actingUserId: string,
  ): Promise<VariantAdminDTO>;
  deleteVariant(productId: string, variantId: string, actingUserId: string): Promise<void>;
}

function toAdminDTO(
  variant: {
    id: string;
    size: string;
    color: string;
    sku: string;
    stock: number;
    priceDelta: Prisma.Decimal;
    isActive: boolean;
  },
  basePrice: number,
): VariantAdminDTO {
  return {
    id: variant.id,
    size: variant.size,
    color: variant.color,
    sku: variant.sku,
    stock: variant.stock,
    priceDelta: Number(variant.priceDelta),
    finalPrice: basePrice + Number(variant.priceDelta),
    isActive: variant.isActive,
  };
}

export class VariantServiceImpl implements VariantService {
  constructor(
    private readonly variantRepo: VariantRepository,
    private readonly productRepo: ProductRepository,
  ) {}

  async listByProduct(productId: string): Promise<VariantAdminDTO[]> {
    const product = await this.productRepo.findById(productId);
    if (!product) {
      throw new NotFoundError("Product");
    }

    const variants = await this.variantRepo.findAllByProduct(productId);
    const basePrice = Number(product.basePrice);

    return variants.map((v) => toAdminDTO(v, basePrice));
  }

  async createVariant(productId: string, data: CreateVariantInput): Promise<VariantAdminDTO> {
    const product = await this.productRepo.findById(productId);
    if (!product?.isActive) {
      throw new NotFoundError("Product");
    }

    const basePrice = Number(product.basePrice);
    const finalPrice = basePrice + data.priceDelta;

    if (finalPrice <= 0) {
      throw new ValidationError("El precio final de la variante debe ser mayor a 0");
    }

    const combinationExists = await this.variantRepo.existsCombination(
      productId,
      data.size,
      data.color,
    );
    if (combinationExists) {
      throw new ConflictError(
        `Ya existe una variante con talla ${data.size} y color ${data.color} para este producto`,
      );
    }

    let sku: string;
    if (data.sku) {
      const skuExists = await this.variantRepo.skuExists(data.sku);
      if (skuExists) {
        throw new ConflictError(`El SKU "${data.sku}" ya está en uso`);
      }
      sku = data.sku;
    } else {
      sku = await generateUniqueSku(product.name, data.color, data.size, (candidate) =>
        this.variantRepo.skuExists(candidate),
      );
    }

    const variant = await this.variantRepo.create(productId, {
      size: data.size as Size,
      color: data.color,
      sku,
      stock: data.stock,
      priceDelta: data.priceDelta,
    });

    return toAdminDTO(variant, basePrice);
  }

  async updateVariant(
    productId: string,
    variantId: string,
    data: UpdateVariantInput,
    actingUserId: string,
  ): Promise<VariantAdminDTO> {
    const product = await this.productRepo.findById(productId);
    if (!product) {
      throw new NotFoundError("Product");
    }

    const existing = await this.variantRepo.findById(variantId);
    if (existing?.productId !== productId) {
      throw new NotFoundError("Variant");
    }

    const basePrice = Number(product.basePrice);
    const priceDelta = data.priceDelta ?? Number(existing.priceDelta);
    const finalPrice = basePrice + priceDelta;

    if (finalPrice <= 0) {
      throw new ValidationError("El precio final de la variante debe ser mayor a 0");
    }

    if (data.sku !== undefined && data.sku !== existing.sku) {
      const skuExists = await this.variantRepo.skuExists(data.sku, variantId);
      if (skuExists) {
        throw new ConflictError(`El SKU "${data.sku}" ya está en uso`);
      }
    }

    const variant = await this.variantRepo.update(variantId, {
      stock: data.stock,
      priceDelta: data.priceDelta,
      sku: data.sku,
      isActive: data.isActive,
      ...(data.isActive === false
        ? { deactivatedAt: new Date(), deactivatedById: actingUserId }
        : {}),
      ...(data.isActive === true ? { deactivatedAt: null, deactivatedById: null } : {}),
    });

    return toAdminDTO(variant, basePrice);
  }

  async deleteVariant(productId: string, variantId: string, actingUserId: string): Promise<void> {
    const product = await this.productRepo.findById(productId);
    if (!product) {
      throw new NotFoundError("Product");
    }

    const existing = await this.variantRepo.findById(variantId);
    if (existing?.productId !== productId) {
      throw new NotFoundError("Variant");
    }

    await this.variantRepo.softDelete(variantId, actingUserId);
  }
}
