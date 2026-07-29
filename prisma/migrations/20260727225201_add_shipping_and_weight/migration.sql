/*
  Warnings:

  - Added the required column `weightGrams` to the `order_items` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "order_items" ADD COLUMN     "weightGrams" INTEGER NOT NULL;

-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "shippingCarrier" TEXT,
ADD COLUMN     "shippingService" TEXT;

-- AlterTable
ALTER TABLE "products" ADD COLUMN     "weightGrams" INTEGER NOT NULL DEFAULT 300;
