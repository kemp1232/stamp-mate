"use server";

import { redirect } from "next/navigation";
import { APIError } from "better-auth";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { StaffRole } from "@/generated/prisma/enums";
import { loginSchema, registerSchema } from "@/lib/validations/auth";

export type AuthActionState = { error?: string };

export async function registerOwner(
  _prevState: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const parsed = registerSchema.safeParse({
    businessName: formData.get("businessName"),
    name: formData.get("name"),
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const { businessName, name, email, password } = parsed.data;

  let userId: string;
  try {
    const { user } = await auth.api.signUpEmail({
      body: { name, email, password },
    });
    userId = user.id;
  } catch (err) {
    throw err;
    // console.log("err", err);
    // if (err instanceof APIError) {
    //   return { error: err.message };
    // }
    // return { error: "Could not create account. Please try again." };
  }

  // A newly registered owner gets their own business and an OWNER
  // membership in it. Store setup happens in Milestone 3.
  await prisma.$transaction(async (tx) => {
    const business = await tx.business.create({
      data: { name: businessName },
    });
    await tx.staffMembership.create({
      data: {
        role: StaffRole.OWNER,
        userId,
        businessId: business.id,
      },
    });
  });

  redirect("/dashboard");
}

export async function loginWithPassword(
  _prevState: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  try {
    await auth.api.signInEmail({ body: parsed.data });
  } catch (err) {
    if (err instanceof APIError) {
      return { error: "Invalid email or password." };
    }
    return { error: "Could not log in. Please try again." };
  }

  redirect("/dashboard");
}
