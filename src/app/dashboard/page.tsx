import Link from "next/link";
import { getStaffMembershipsForUser, requireUser } from "@/lib/authorization";
import { getDashboardStats } from "@/lib/dashboard";
import { Button } from "@/components/ui/button";
import { StatCard } from "@/components/stat-card";

export default async function DashboardPage() {
  const user = await requireUser();
  const memberships = await getStaffMembershipsForUser(user.id);
  // Stats are owner-only content, but this page itself stays reachable for
  // any logged-in staff — matching how login/registration already redirect
  // everyone here regardless of role.
  const ownerMembership = memberships.find((m) => m.role === "OWNER");
  const stats = ownerMembership
    ? await getDashboardStats(ownerMembership.businessId)
    : null;

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold">Dashboard</h1>
        <p className="text-muted-foreground">Signed in as {user.email}</p>
      </div>

      {stats ? (
        <>
          <div className="grid grid-cols-2 gap-3">
            <StatCard label="Customers" value={stats.totalCustomers} />
            <StatCard label="Active cards" value={stats.activeCards} />
            <StatCard label="Completed cards" value={stats.completedCards} />
            <StatCard label="Stamps given" value={stats.totalStamps} />
            <StatCard label="Redemptions" value={stats.totalRedemptions} />
          </div>

          <div className="flex flex-col gap-3 sm:flex-row">
            <Button
              nativeButton={false}
              render={<Link href="/dashboard/customers" />}
              className="flex-1"
            >
              View customers
            </Button>
            <Button
              nativeButton={false}
              variant="outline"
              render={<Link href="/dashboard/stats" />}
              className="flex-1"
            >
              View activity
            </Button>
          </div>
        </>
      ) : null}

      <div className="rounded-lg border p-4">
        <h2 className="mb-2 font-medium">Staff tools</h2>
        <p className="mb-3 text-sm text-muted-foreground">
          Scan a customer&apos;s QR code to add stamps or redeem rewards.
        </p>
        <Button nativeButton={false} render={<Link href="/staff" />}>
          Go to staff area
        </Button>
      </div>

      <div className="rounded-lg border p-4">
        <h2 className="mb-2 font-medium">Your businesses</h2>
        {memberships.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No business memberships yet.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {memberships.map((membership) => (
              <li key={membership.id} className="text-sm">
                {membership.business.name} —{" "}
                <span className="font-medium">{membership.role}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {ownerMembership ? (
        <div className="rounded-lg border p-4">
          <h2 className="mb-2 font-medium">Loyalty program</h2>
          <p className="mb-3 text-sm text-muted-foreground">
            Set up the stamps and reward customers will see when they join.
          </p>
          <Button
            nativeButton={false}
            render={<Link href="/dashboard/program" />}
          >
            Manage program
          </Button>
        </div>
      ) : null}
    </div>
  );
}
