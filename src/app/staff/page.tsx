import Link from "next/link";
import {
  requireUser,
  getStaffMembershipsForUser,
} from "@/lib/authorization";
import { Button } from "@/components/ui/button";
import { StaffRole } from "@/generated/prisma/enums";

export default async function StaffPage() {
  const user = await requireUser();
  const memberships = await getStaffMembershipsForUser(user.id);
  const isOwner = memberships.some(
    (membership) => membership.role === StaffRole.OWNER,
  );

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6 p-6 animate-in fade-in duration-200">
      <div>
        <h1 className="text-2xl font-semibold">Staff</h1>
        <p className="text-muted-foreground">Signed in as {user.email}</p>
      </div>
      {isOwner && (
        <Button
          variant="outline"
          size="sm"
          className="self-start"
          nativeButton={false}
          render={<Link href="/dashboard" />}
        >
          Back to dashboard
        </Button>
      )}
      <Button
        size="lg"
        nativeButton={false}
        render={<Link href="/staff/scan" />}
      >
        Scan customer QR
      </Button>
      <p className="text-sm text-muted-foreground">
        Scan a customer&apos;s QR code, or enter their card link manually, to
        add stamps and redeem rewards.
      </p>
    </div>
  );
}
