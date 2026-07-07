"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";
import { requireBusinessAccess } from "@/lib/authorization";
import { getStaffCardByToken, generateCardToken } from "@/lib/loyalty-card";

export type RedeemRewardActionState = { error?: string };

const cardTokenSchema = z.object({
  cardToken: z.string().min(1, "Missing card token"),
});

/** Internal control-flow error — caught below and turned into a friendly message. */
class RedeemRewardError extends Error {}

export async function redeemReward(
  _prevState: RedeemRewardActionState,
  formData: FormData,
): Promise<RedeemRewardActionState> {
  const parsed = cardTokenSchema.safeParse({
    cardToken: formData.get("cardToken"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const { cardToken } = parsed.data;

  // Business/store ownership is derived from the card token on the server —
  // the client never supplies a businessId here.
  const card = await getStaffCardByToken(cardToken);
  if (!card) {
    return { error: "Card not found." };
  }

  const { user } = await requireBusinessAccess(card.businessId);

  let newCardToken: string;
  try {
    newCardToken = await prisma.$transaction(async (tx) => {
      const freshCard = await tx.loyaltyCard.findUniqueOrThrow({
        where: { id: card.id },
        select: { status: true },
      });

      if (freshCard.status !== "COMPLETED") {
        throw new RedeemRewardError("This card isn't ready to redeem yet.");
      }

      // Update-before-insert matters here: the partial unique index only
      // allows one ACTIVE card per customer+program, and this update makes
      // the old row non-active *within this same transaction* before the
      // new ACTIVE row below is inserted.
      await tx.loyaltyCard.update({
        where: { id: card.id },
        data: { status: "REDEEMED" },
      });

      await tx.rewardRedemption.create({
        data: { loyaltyCardId: card.id, staffUserId: user.id },
      });

      const newCard = await tx.loyaltyCard.create({
        data: {
          customerId: card.customerId,
          loyaltyProgramId: card.loyaltyProgramId,
          cardToken: generateCardToken(),
          cycleNumber: card.cycleNumber + 1,
        },
      });

      return newCard.cardToken;
    });
  } catch (err) {
    if (err instanceof RedeemRewardError) {
      return { error: err.message };
    }
    // A concurrent double-tap can race past the status check above; the
    // unique loyaltyCardId on RewardRedemption rejects the second insert.
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === "P2002"
    ) {
      return { error: "This card has already been redeemed." };
    }
    throw err;
  }

  revalidatePath(`/staff/cards/${cardToken}`);
  redirect(`/staff/cards/${newCardToken}?redeemed=1`);
}
