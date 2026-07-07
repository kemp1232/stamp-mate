-- CreateEnum
CREATE TYPE "LoyaltyCardStatus" AS ENUM ('ACTIVE', 'COMPLETED', 'REDEEMED', 'CANCELLED');

-- CreateTable
CREATE TABLE "customer" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "customer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "loyalty_card" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "loyaltyProgramId" TEXT NOT NULL,
    "cardToken" TEXT NOT NULL,
    "status" "LoyaltyCardStatus" NOT NULL DEFAULT 'ACTIVE',
    "cycleNumber" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "loyalty_card_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "customer_businessId_idx" ON "customer"("businessId");

-- CreateIndex
CREATE UNIQUE INDEX "customer_businessId_phone_key" ON "customer"("businessId", "phone");

-- CreateIndex
CREATE UNIQUE INDEX "loyalty_card_cardToken_key" ON "loyalty_card"("cardToken");

-- CreateIndex
CREATE INDEX "loyalty_card_customerId_idx" ON "loyalty_card"("customerId");

-- CreateIndex
CREATE INDEX "loyalty_card_loyaltyProgramId_idx" ON "loyalty_card"("loyaltyProgramId");

-- AddForeignKey
ALTER TABLE "customer" ADD CONSTRAINT "customer_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "loyalty_card" ADD CONSTRAINT "loyalty_card_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "loyalty_card" ADD CONSTRAINT "loyalty_card_loyaltyProgramId_fkey" FOREIGN KEY ("loyaltyProgramId") REFERENCES "loyalty_program"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Enforce "one active card per customer+program" at the database level.
-- Prisma's schema DSL can't express a partial index, so this is hand-added.
CREATE UNIQUE INDEX "loyalty_card_one_active_per_customer_program"
ON "loyalty_card" ("customerId", "loyaltyProgramId")
WHERE "status" = 'ACTIVE';
