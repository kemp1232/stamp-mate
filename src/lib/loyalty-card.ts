import { randomBytes } from "node:crypto";
import "server-only";
import { prisma } from "@/lib/prisma";

/** Random, URL-safe, hard-to-guess token — never derived from customer data. */
export function generateCardToken(): string {
  return randomBytes(24).toString("base64url");
}

/**
 * Public, unauthenticated lookup for the customer-facing card. Only
 * includes fields safe to show to whoever holds the card token — no
 * phone, email, or raw customer/business IDs.
 */
export async function getCustomerCardByToken(cardToken: string) {
  const card = await prisma.loyaltyCard.findUnique({
    where: { cardToken },
    select: {
      cardToken: true,
      status: true,
      customer: { select: { name: true } },
      loyaltyProgram: {
        select: {
          name: true,
          rewardText: true,
          requiredStamps: true,
          store: { select: { name: true } },
        },
      },
      _count: { select: { stamps: true } },
    },
  });

  if (!card) {
    return null;
  }

  const { _count, ...rest } = card;
  return { ...rest, currentStamps: _count.stamps };
}

/**
 * Staff-side lookup — includes businessId so the caller can verify the
 * logged-in staff member actually belongs to this card's business before
 * showing anything, plus the card's own id/customerId/loyaltyProgramId/
 * cycleNumber (needed to mutate it and to start the next cycle on
 * redemption) and recent stamp history.
 */
export async function getStaffCardByToken(cardToken: string) {
  const card = await prisma.loyaltyCard.findUnique({
    where: { cardToken },
    select: {
      id: true,
      customerId: true,
      loyaltyProgramId: true,
      cardToken: true,
      status: true,
      cycleNumber: true,
      customer: { select: { name: true, businessId: true } },
      loyaltyProgram: {
        select: {
          name: true,
          rewardText: true,
          requiredStamps: true,
          store: { select: { name: true } },
        },
      },
      _count: { select: { stamps: true } },
      stamps: {
        orderBy: { createdAt: "desc" },
        take: 5,
        select: {
          id: true,
          createdAt: true,
          staffUser: { select: { name: true } },
        },
      },
    },
  });

  if (!card) {
    return null;
  }

  const { _count, ...rest } = card;
  return {
    ...rest,
    businessId: card.customer.businessId,
    currentStamps: _count.stamps,
  };
}
