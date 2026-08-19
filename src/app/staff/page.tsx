import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import {
  requireUser,
  getStaffMembershipsForUser,
} from "@/lib/authorization";
import { Button } from "@/components/ui/button";
import { ScannerPanel } from "@/components/scanner-panel";
import { StaffRole } from "@/generated/prisma/enums";

export default async function StaffPage() {
  const user = await requireUser();
  const memberships = await getStaffMembershipsForUser(user.id);
  const isOwner = memberships.some(
    (membership) => membership.role === StaffRole.OWNER,
  );

  return (
    <div className="mx-auto flex max-w-sm flex-col gap-6 p-6 animate-in fade-in duration-200">
      <div>
        <h1 className="text-xl font-semibold">Scan customer QR</h1>
        <p className="text-sm text-muted-foreground">
          Point the camera at the customer&apos;s personal QR code.
        </p>
      </div>

      {isOwner && (
        <Button
          variant="outline"
          size="sm"
          className="self-start"
          nativeButton={false}
          render={<Link href="/dashboard" />}
        >
          <ArrowLeft data-icon="inline-start" />
          Back to dashboard
        </Button>
      )}

      <ScannerPanel />
    </div>
  );
}
