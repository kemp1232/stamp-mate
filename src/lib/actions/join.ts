"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";
import { LoyaltyProgramStatus } from "@/generated/prisma/enums";
import { normalizePhone } from "@/lib/phone";
import { generateCardToken } from "@/lib/loyalty-card";
import { joinSchema } from "@/lib/validations/join";

export type JoinActionState = { error?: string };

async function findOrCreateActiveCard(
  tx: Prisma.TransactionClient,
  customerId: string,
  loyaltyProgramId: string,
) {
  const existing = await tx.loyaltyCard.findFirst({
    where: { customerId, loyaltyProgramId, status: "ACTIVE" },
  });
  if (existing) {
    return existing;
  }

  try {
    return await tx.loyaltyCard.create({
      data: { customerId, loyaltyProgramId, cardToken: generateCardToken() },
    });
  } catch (err) {
    // A concurrent duplicate submission can race past the findFirst check
    // above; the DB's partial unique index rejects the second insert, so we
    // fall back to the card it just created instead of erroring.
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === "P2002"
    ) {
      const retried = await tx.loyaltyCard.findFirst({
        where: { customerId, loyaltyProgramId, status: "ACTIVE" },
      });
      if (retried) {
        return retried;
      }
    }
    throw err;
  }
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

  const cardToken = await prisma.$transaction(async (tx) => {
    const customer = await tx.customer.upsert({
      where: { businessId_phone: { businessId: store.businessId, phone } },
      update: { name: parsed.data.name },
      create: { businessId: store.businessId, name: parsed.data.name, phone },
    });

    const card = await findOrCreateActiveCard(tx, customer.id, program.id);
    return card.cardToken;
  });

  redirect(`/card/${cardToken}`);
}
