"use server";

import { redirect } from "next/navigation";
import { APIError } from "better-auth";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { StaffRole } from "@/generated/prisma/enums";
import {
  loginSchema,
  registerSchema,
  sanitizeRedirectTarget,
} from "@/lib/validations/auth";

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
    // The user-facing message is deliberately generic and identical for
    // every failure mode here (duplicate email, rejected password, internal
    // error, ...). Better Auth's raw message for a duplicate ("User already
    // exists.") would let an attacker enumerate registered emails by trying
    // addresses and watching which one comes back different — so nothing
    // about `err` (which may echo back the submitted email/PII) is ever
    // surfaced to the client.
    //
    // It must still be logged, though: silently swallowing it makes a DB
    // outage or Better Auth misconfiguration invisible server-side while
    // telling the user their own input was wrong. Only a coarse, PHI/PII
    // free signal is logged — no email, no password, no raw error body.
    console.error(
      "registerOwner: signUpEmail failed",
      err instanceof APIError ? { status: err.status } : "unknown error",
    );
    return {
      error:
        "Could not create account. Check your details, or log in if you already have an account.",
    };
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

  redirect(sanitizeRedirectTarget(formData.get("redirectTo")));
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

  redirect(sanitizeRedirectTarget(formData.get("redirectTo")));
}
