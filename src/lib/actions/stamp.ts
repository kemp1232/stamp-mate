"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
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

  if (card.status === "REDEEMED" || card.status === "CANCELLED") {
    return { error: "This card's stamps can no longer be changed." };
  }

  try {
    await prisma.$transaction(async (tx) => {
      const latestStamp = await tx.stamp.findFirst({
        where: { loyaltyCardId: card.id },
        orderBy: { createdAt: "desc" },
      });

      if (!latestStamp) {
        throw new StampActionError("There are no stamps to undo.");
      }

      await tx.stamp.delete({ where: { id: latestStamp.id } });

      const remaining = await tx.stamp.count({
        where: { loyaltyCardId: card.id },
      });

      if (
        card.status === "COMPLETED" &&
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
    throw err;
  }

  revalidatePath(`/staff/cards/${cardToken}`);
  return { success: "Last stamp undone." };
}
