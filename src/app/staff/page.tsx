import Link from "next/link";
import { requireUser } from "@/lib/authorization";
import { Button } from "@/components/ui/button";

export default async function StaffPage() {
  const user = await requireUser();

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold">Staff</h1>
        <p className="text-muted-foreground">Signed in as {user.email}</p>
      </div>
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
