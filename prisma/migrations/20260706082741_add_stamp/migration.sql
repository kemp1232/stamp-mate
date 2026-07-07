-- CreateTable
CREATE TABLE "stamp" (
    "id" TEXT NOT NULL,
    "loyaltyCardId" TEXT NOT NULL,
    "staffUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stamp_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "stamp_loyaltyCardId_idx" ON "stamp"("loyaltyCardId");

-- CreateIndex
CREATE INDEX "stamp_staffUserId_idx" ON "stamp"("staffUserId");

-- AddForeignKey
ALTER TABLE "stamp" ADD CONSTRAINT "stamp_loyaltyCardId_fkey" FOREIGN KEY ("loyaltyCardId") REFERENCES "loyalty_card"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stamp" ADD CONSTRAINT "stamp_staffUserId_fkey" FOREIGN KEY ("staffUserId") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
