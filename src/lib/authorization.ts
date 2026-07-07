import "server-only";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { StaffRole } from "@/generated/prisma/enums";

export async function getCurrentUser() {
  const session = await auth.api.getSession({ headers: await headers() });
  return session?.user ?? null;
}

/** Redirects to /login if there is no authenticated user. */
export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }
  return user;
}

export function getStaffMembership(userId: string, businessId: string) {
  return prisma.staffMembership.findUnique({
    where: { userId_businessId: { userId, businessId } },
  });
}

export function getStaffMembershipsForUser(userId: string) {
  return prisma.staffMembership.findMany({
    where: { userId },
    include: { business: true },
  });
}

/** Requires login and membership (any role) in the given business. */
export async function requireBusinessAccess(businessId: string) {
  const user = await requireUser();
  const membership = await getStaffMembership(user.id, businessId);
  if (!membership) {
    redirect("/dashboard");
  }
  return { user, membership };
}

/** Requires login and an OWNER membership in the given business. */
export async function requireOwner(businessId: string) {
  const { user, membership } = await requireBusinessAccess(businessId);
  if (membership.role !== StaffRole.OWNER) {
    redirect("/dashboard");
  }
  return { user, membership };
}

/**
 * Requires login and an OWNER membership in some business. For MVP, an
 * owner has exactly one business, so this is used by pages that don't
 * already know which businessId to check (e.g. /dashboard/program).
 */
export async function requireOwnedBusiness() {
  const user = await requireUser();
  const memberships = await getStaffMembershipsForUser(user.id);
  const ownerMembership = memberships.find(
    (membership) => membership.role === StaffRole.OWNER,
  );

  if (!ownerMembership) {
    redirect("/dashboard");
  }

  return { user, membership: ownerMembership };
}
