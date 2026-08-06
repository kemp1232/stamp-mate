"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";
import {
  LoyaltyCardStatus,
  LoyaltyProgramStatus,
} from "@/generated/prisma/enums";
import { normalizePhone } from "@/lib/phone";
import { generateCardToken } from "@/lib/loyalty-card";
import { joinSchema } from "@/lib/validations/join";

export type JoinActionState = { error?: string };

const ACTIVE_CARD_STATUSES: LoyaltyCardStatus[] = [
  LoyaltyCardStatus.ACTIVE,
  LoyaltyCardStatus.COMPLETED,
];

async function findOrCreateActiveCard(
  tx: Prisma.TransactionClient,
  customerId: string,
  loyaltyProgramId: string,
) {
  // A COMPLETED-but-unredeemed card also counts as "the card this customer
  // should keep using" — otherwise a rescan mints a second empty card and
  // strands the earned reward on the orphaned one (H-3).
  //
  // orderBy makes "the" existing card deterministic if a legacy duplicate
  // ever exists (e.g. from before H-3 was fixed) — pick the oldest rather
  // than whichever row the planner returns first (minor finding).
  const existing = await tx.loyaltyCard.findFirst({
    where: {
      customerId,
      loyaltyProgramId,
      status: { in: ACTIVE_CARD_STATUSES },
    },
    orderBy: { createdAt: "asc" },
  });
  if (existing) {
    return existing;
  }

  // No P2002 recovery here: Prisma doesn't use savepoints, so once this
  // insert fails the *entire* enclosing $transaction is aborted — Postgres
  // is left in an aborted-transaction state and any further query on `tx`,
  // including a recovery findFirst, itself fails with "current transaction
  // is aborted" (I-1). A concurrent duplicate submission racing this insert
  // is instead recovered by retrying the whole transaction from outside
  // (see joinLoyaltyProgram below).
  return tx.loyaltyCard.create({
    data: { customerId, loyaltyProgramId, cardToken: generateCardToken() },
  });
}

const JOIN_RETRY_ATTEMPTS = 3;

/**
 * Runs the customer-upsert + card-lookup-or-create as one transaction, and
 * retries the whole thing (not just the failing statement) if a concurrent
 * duplicate submission causes the card insert's partial unique index to
 * reject it with P2002. The customer upsert is idempotent, so re-running it
 * on retry is safe; the next attempt's findFirst will see the card the
 * other request just committed.
 */
async function joinWithRetry(
  businessId: string,
  name: string,
  phone: string,
  loyaltyProgramId: string,
): Promise<string> {
  for (let attempt = 1; attempt <= JOIN_RETRY_ATTEMPTS; attempt++) {
    try {
      return await prisma.$transaction(async (tx) => {
        const customer = await tx.customer.upsert({
          where: { businessId_phone: { businessId, phone } },
          update: { name },
          create: { businessId, name, phone },
        });

        const card = await findOrCreateActiveCard(
          tx,
          customer.id,
          loyaltyProgramId,
        );
        return card.cardToken;
      });
    } catch (err) {
      const isRetryable =
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === "P2002";
      if (isRetryable && attempt < JOIN_RETRY_ATTEMPTS) {
        continue;
      }
      throw err;
    }
  }
  // Unreachable: the loop above always returns or throws before running out
  // of attempts, but TypeScript can't see that a for-loop with a throw on
  // its last iteration never falls through.
  throw new Error("Could not join loyalty program.");
}

export async function joinLoyaltyProgram(
  _prevState: JoinActionState,
  formData: FormData,
): Promise<JoinActionState> {
  const storeSlug = formData.get("storeSlug");
  if (typeof storeSlug !== "string" || !storeSlug) {
    return { error: "Missing store." };
  }

  const parsed = joinSchema.safeParse({
    name: formData.get("name"),
    phone: formData.get("phone"),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  // The store/business/program are looked up from the slug on the server —
  // the client never supplies a businessId or programId here.
  const store = await prisma.store.findUnique({
    where: { slug: storeSlug },
    include: {
      loyaltyPrograms: {
        where: { status: LoyaltyProgramStatus.ACTIVE },
        take: 1,
      },
    },
  });

  const program = store?.loyaltyPrograms[0];
  if (!store || !program) {
    return { error: "This store isn't accepting new members right now." };
  }

  const phone = normalizePhone(parsed.data.phone);

  // The Zod regex counts punctuation toward its min length, so an input
  // like "(((-)))" passes it but normalizePhone reduces it to an empty
  // string. The customer upsert below keys on (businessId, phone), so
  // letting that through merges unrelated people onto one shared customer
  // row and one shared card (C-2). Re-check the length after normalizing.
  if (phone.length < 7) {
    return { error: "Enter a valid phone number." };
  }

  let cardToken: string;
  try {
    cardToken = await joinWithRetry(
      store.businessId,
      parsed.data.name,
      phone,
      program.id,
    );
  } catch (err) {
    // joinWithRetry rethrows once JOIN_RETRY_ATTEMPTS is exhausted. Left
    // uncaught, that raw PrismaClientKnownRequestError would escape this
    // server action and hit the generic error.tsx boundary instead of
    // giving the customer a way to just try submitting again. Scoped to
    // P2002 specifically — the one kind we know is transient/retryable —
    // so a genuinely unexpected error still surfaces loudly rather than
    // being silently swallowed here.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return {
        error: "Something went wrong joining this program. Please try again.",
      };
    }
    throw err;
  }

  redirect(`/card/${cardToken}`);
}
