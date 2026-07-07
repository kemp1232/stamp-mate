import Link from "next/link";
import { getStaffMembershipsForUser, requireUser } from "@/lib/authorization";
import { getDashboardStats } from "@/lib/dashboard";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardTitle } from "@/components/ui/card";
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
    <div className="mx-auto flex max-w-2xl flex-col gap-6 p-6 animate-in fade-in duration-300">
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

      <Card>
        <CardContent className="flex flex-col gap-3">
          <CardTitle>Staff tools</CardTitle>
          <p className="text-sm text-muted-foreground">
            Scan a customer&apos;s QR code to add stamps or redeem rewards.
          </p>
          <Button
            nativeButton={false}
            render={<Link href="/staff" />}
            className="self-start"
          >
            Go to staff area
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="flex flex-col gap-3">
          <CardTitle>Your businesses</CardTitle>
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
        </CardContent>
      </Card>

      {ownerMembership ? (
        <Card>
          <CardContent className="flex flex-col gap-3">
            <CardTitle>Loyalty program</CardTitle>
            <p className="text-sm text-muted-foreground">
              Set up the stamps and reward customers will see when they join.
            </p>
            <Button
              nativeButton={false}
              render={<Link href="/dashboard/program" />}
              className="self-start"
            >
              Manage program
            </Button>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
