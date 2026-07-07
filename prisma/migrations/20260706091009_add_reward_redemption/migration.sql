-- CreateTable
CREATE TABLE "reward_redemption" (
    "id" TEXT NOT NULL,
    "loyaltyCardId" TEXT NOT NULL,
    "staffUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reward_redemption_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "reward_redemption_loyaltyCardId_key" ON "reward_redemption"("loyaltyCardId");

-- CreateIndex
CREATE INDEX "reward_redemption_staffUserId_idx" ON "reward_redemption"("staffUserId");

-- AddForeignKey
ALTER TABLE "reward_redemption" ADD CONSTRAINT "reward_redemption_loyaltyCardId_fkey" FOREIGN KEY ("loyaltyCardId") REFERENCES "loyalty_card"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reward_redemption" ADD CONSTRAINT "reward_redemption_staffUserId_fkey" FOREIGN KEY ("staffUserId") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
