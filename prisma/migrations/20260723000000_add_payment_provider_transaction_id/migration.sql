-- AlterTable
ALTER TABLE "payments" ADD COLUMN "providerTransactionId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "payments_providerTransactionId_key" ON "payments"("providerTransactionId");
