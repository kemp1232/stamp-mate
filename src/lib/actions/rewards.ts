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
      // Lock the card row first so concurrent undo/addStamp can't flip
      // status or stamp count out from under this transaction between the
      // read below and the write — the same pattern as addStamp/
      // undoLastStamp (C-1/H-1). Without this lock, redeem could read
      // COMPLETED, a concurrent undo commits underneath it (card back to
      // ACTIVE, under-stamped), and redeem would still commit unnoticed.
      await tx.$queryRaw`SELECT id FROM "loyalty_card" WHERE id = ${card.id} FOR UPDATE`;

      const freshCard = await tx.loyaltyCard.findUniqueOrThrow({
        where: { id: card.id },
        select: { status: true, _count: { select: { stamps: true } } },
      });

      if (freshCard.status !== "COMPLETED") {
        throw new RedeemRewardError("This card isn't ready to redeem yet.");
      }

      // Status alone isn't enough — a legacy/racing card could be COMPLETED
      // with fewer than requiredStamps (e.g. an undo that lands between the
      // status flip and this check on a codepath without the lock above).
      // Re-verify the actual stamp count against the card's own program.
      if (freshCard._count.stamps < card.loyaltyProgram.requiredStamps) {
        throw new RedeemRewardError("This card isn't ready to redeem yet.");
      }

      // Update-before-insert matters here: the partial unique index only
      // allows one ACTIVE card per customer+program, and this update makes
      // the old row non-active *within this same transaction* before the
      // new ACTIVE row below is inserted. The transition is also
      // conditional on status ("COMPLETED" in the where clause) so it's
      // safe even without the row lock above — a defense-in-depth match
      // for the P2002 handling below.
      const updated = await tx.loyaltyCard.updateMany({
        where: { id: card.id, status: "COMPLETED" },
        data: { status: "REDEEMED" },
      });
      if (updated.count === 0) {
        throw new RedeemRewardError("This card isn't ready to redeem yet.");
      }

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
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === "P2002"
    ) {
      // Two different unique constraints can produce a P2002 here, and
      // Prisma has no savepoints — either way the whole transaction above
      // (including the RewardRedemption insert and the status flip) has
      // already been rolled back, so nothing was actually redeemed:
      //   (a) a concurrent double-tap raced past the status check above
      //       and both committed a RewardRedemption for this card
      //       (reward_redemption_loyaltyCardId_key) — this one really is
      //       "already redeemed".
      //   (b) the new-cycle loyaltyCard.create collided with a legacy
      //       duplicate ACTIVE card for this customer+program
      //       ("loyalty_card_one_active_per_customer_program") — the same
      //       H-3 shape stamp.ts's undoLastStamp guards against. Nothing
      //       was redeemed, so telling the user "already redeemed" would
      //       be false.
      // Distinguish by re-querying state rather than parsing the error
      // shape (see store.ts): if a redemption row now exists for this
      // card, (a) is what happened; otherwise it must be (b).
      const alreadyRedeemed = await prisma.rewardRedemption.findUnique({
        where: { loyaltyCardId: card.id },
      });
      if (alreadyRedeemed) {
        return { error: "This card has already been redeemed." };
      }
      return {
        error:
          "Can't redeem: this customer already has another active card for this program.",
      };
    }
    throw err;
  }

  revalidatePath(`/staff/cards/${cardToken}`);
  redirect(`/staff/cards/${newCardToken}?redeemed=1`);
}
