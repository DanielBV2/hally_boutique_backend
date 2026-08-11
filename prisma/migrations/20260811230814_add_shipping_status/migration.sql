-- CreateEnum
CREATE TYPE "ShippingStatus" AS ENUM ('PENDING', 'LABEL_GENERATED', 'LABEL_FAILED');

-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "shippingStatus" "ShippingStatus" NOT NULL DEFAULT 'PENDING';
