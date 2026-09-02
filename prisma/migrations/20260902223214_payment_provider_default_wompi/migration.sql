-- AlterTable
ALTER TABLE "payments" ALTER COLUMN "provider" SET DEFAULT 'WOMPI';

-- RenameIndex
ALTER INDEX "idx_products_name_trgm" RENAME TO "products_name_idx";
