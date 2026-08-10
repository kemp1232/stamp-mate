"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";
import { requireBusinessAccess } from "@/lib/authorization";
import { getStaffCardByToken } from "@/lib/loyalty-card";

export type StampActionState = { error?: string; success?: string };

const cardTokenSchema = z.object({
  cardToken: z.string().min(1, "Missing card token"),
});

/** Internal control-flow error — caught below and turned into a friendly message. */
class StampActionError extends Error {}

export async function addStamp(
  _prevState: StampActionState,
  formData: FormData,
): Promise<StampActionState> {
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

  try {
    await prisma.$transaction(async (tx) => {
      // Lock the card row first so concurrent taps serialize instead of
      // all reading the same pre-insert count() at READ COMMITTED — that
      // race is what let 5 simultaneous taps put 6-9 stamps on a 5-stamp
      // card (C-1). Each waiting transaction re-reads the fresh row once
      // it acquires the lock.
      await tx.$queryRaw`SELECT id FROM "loyalty_card" WHERE id = ${card.id} FOR UPDATE`;

      const freshCard = await tx.loyaltyCard.findUniqueOrThrow({
        where: { id: card.id },
        select: { status: true },
      });

      if (freshCard.status !== "ACTIVE") {
        throw new StampActionError(
          "This card can't take more stamps right now.",
        );
      }

      const stampCount = await tx.stamp.count({
        where: { loyaltyCardId: card.id },
      });
      if (stampCount >= card.loyaltyProgram.requiredStamps) {
        throw new StampActionError("This card is already full.");
      }

      await tx.stamp.create({
        data: { loyaltyCardId: card.id, staffUserId: user.id },
      });

      if (stampCount + 1 >= card.loyaltyProgram.requiredStamps) {
        await tx.loyaltyCard.update({
          where: { id: card.id },
          data: { status: "COMPLETED" },
        });
      }
    });
  } catch (err) {
    if (err instanceof StampActionError) {
      return { error: err.message };
    }
    throw err;
  }

  revalidatePath(`/staff/cards/${cardToken}`);
  return { success: "Stamp added." };
}

export async function undoLastStamp(
  _prevState: StampActionState,
  formData: FormData,
): Promise<StampActionState> {
  const parsed = cardTokenSchema.safeParse({
    cardToken: formData.get("cardToken"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const { cardToken } = parsed.data;

  const card = await getStaffCardByToken(cardToken);
  if (!card) {
    return { error: "Card not found." };
  }

  await requireBusinessAccess(card.businessId);

  // Fast out for the common case. This read is stale by the time the
  // transaction below runs, so it's a UX shortcut only — the transaction
  // re-checks status against the locked row, since a concurrent redeem can
  // flip this card to REDEEMED between here and then (H-1).
  if (card.status === "REDEEMED" || card.status === "CANCELLED") {
    return { error: "This card's stamps can no longer be changed." };
  }

  try {
    await prisma.$transaction(async (tx) => {
      // Lock the card row so a concurrent redeem can't flip status out
      // from under this transaction between the check below and the
      // delete/update — the same pattern as addStamp (C-1).
      await tx.$queryRaw`SELECT id FROM "loyalty_card" WHERE id = ${card.id} FOR UPDATE`;

      const freshCard = await tx.loyaltyCard.findUniqueOrThrow({
        where: { id: card.id },
        select: { status: true },
      });

      if (freshCard.status === "REDEEMED" || freshCard.status === "CANCELLED") {
        throw new StampActionError(
          "This card's stamps can no longer be changed.",
        );
      }

      const latestStamp = await tx.stamp.findFirst({
        where: { loyaltyCardId: card.id },
        // id as a secondary key makes "the last stamp" deterministic for
        // two stamps created in the same millisecond (L-3).
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      });

      if (!latestStamp) {
        throw new StampActionError("There are no stamps to undo.");
      }

      await tx.stamp.delete({ where: { id: latestStamp.id } });

      const remaining = await tx.stamp.count({
        where: { loyaltyCardId: card.id },
      });

      if (
        freshCard.status === "COMPLETED" &&
        remaining < card.loyaltyProgram.requiredStamps
      ) {
        await tx.loyaltyCard.update({
          where: { id: card.id },
          data: { status: "ACTIVE" },
        });
      }
    });
  } catch (err) {
    if (err instanceof StampActionError) {
      return { error: err.message };
    }
    // Not purely defense in depth: this IS reachable. A legacy
    // COMPLETED + ACTIVE pair for the same customer+program — exactly what
    // the H-3 bug (fixed in findOrCreateActiveCard) produced before that
    // fix shipped — means undoing the last stamp on the COMPLETED card
    // drops it below requiredStamps and this transaction flips it back to
    // ACTIVE, which collides for real with the partial unique index
    // "loyalty_card_one_active_per_customer_program" against the
    // customer's other already-ACTIVE card. The row lock only serializes
    // concurrent writers to *this* card; it can't prevent a conflict with
    // a different card row. Never let the raw Prisma error leak to the
    // client either way.
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === "P2002"
    ) {
      return {
        error:
          "Can't undo: this customer already has another active card for this program.",
      };
    }
    throw err;
  }

  revalidatePath(`/staff/cards/${cardToken}`);
  return { success: "Last stamp undone." };
}
