"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireOwner } from "@/lib/authorization";
import { getOrCreateDefaultStore } from "@/lib/store";
import { loyaltyProgramSchema } from "@/lib/validations/loyalty-program";

export type ProgramActionState = { error?: string; success?: boolean };

function parseProgramInput(formData: FormData) {
  return loyaltyProgramSchema.safeParse({
    name: formData.get("name"),
    requiredStamps: formData.get("requiredStamps"),
    rewardText: formData.get("rewardText"),
    status: formData.get("status"),
  });
}

export async function createLoyaltyProgram(
  _prevState: ProgramActionState,
  formData: FormData,
): Promise<ProgramActionState> {
  const businessId = formData.get("businessId");
  if (typeof businessId !== "string" || !businessId) {
    return { error: "Missing business." };
  }

  // Verifies the current user is an OWNER of this exact businessId — this
  // is what stops a tampered businessId from writing into another business.
  await requireOwner(businessId);

  const parsed = parseProgramInput(formData);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const store = await getOrCreateDefaultStore(businessId);

  const existing = await prisma.loyaltyProgram.findFirst({
    where: { storeId: store.id },
  });
  if (existing) {
    return {
      error: "This store already has a loyalty program. Edit it instead.",
    };
  }

  await prisma.loyaltyProgram.create({
    data: { ...parsed.data, storeId: store.id },
  });

  revalidatePath("/dashboard/program");
  return { success: true };
}

export async function updateLoyaltyProgram(
  _prevState: ProgramActionState,
  formData: FormData,
): Promise<ProgramActionState> {
  const businessId = formData.get("businessId");
  const programId = formData.get("programId");
  if (
    typeof businessId !== "string" ||
    !businessId ||
    typeof programId !== "string" ||
    !programId
  ) {
    return { error: "Missing program." };
  }

  await requireOwner(businessId);

  const parsed = parseProgramInput(formData);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const store = await getOrCreateDefaultStore(businessId);

  // Scoping the update to this business's own store means a tampered
  // programId belonging to another business simply matches zero rows.
  const updated = await prisma.loyaltyProgram.updateMany({
    where: { id: programId, storeId: store.id },
    data: parsed.data,
  });

  if (updated.count === 0) {
    return { error: "Program not found." };
  }

  revalidatePath("/dashboard/program");
  return { success: true };
}
