import Link from "next/link";
import {
  Activity,
  CheckCircle2,
  ClipboardList,
  CreditCard,
  Gift,
  ScanLine,
  Stamp,
  Store,
  Users,
} from "lucide-react";
import { getStaffMembershipsForUser, requireUser } from "@/lib/authorization";
import { getDashboardStats } from "@/lib/dashboard";
import { cn } from "@/lib/utils";
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
  // A business name up top ("Brew Haven") is what an owner actually
  // recognizes their shop by — the raw login email is real but forgettable,
  // so it's demoted to a subtitle instead of leading the page.
  const primaryBusinessName = memberships[0]?.business.name;

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6 p-6 animate-in fade-in duration-300">
      <div>
        {primaryBusinessName ? (
          <p className="text-sm font-medium tracking-wide text-muted-foreground uppercase">
            Dashboard
          </p>
        ) : null}
        <h1 className="text-2xl font-semibold">
          {primaryBusinessName ?? "Dashboard"}
        </h1>
        <p className="text-muted-foreground">Signed in as {user.email}</p>
      </div>

      {stats ? (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <StatCard label="Customers" value={stats.totalCustomers} icon={Users} />
            <StatCard label="Active cards" value={stats.activeCards} icon={CreditCard} />
            <StatCard
              label="Completed cards"
              value={stats.completedCards}
              icon={CheckCircle2}
            />
            <StatCard label="Stamps given" value={stats.totalStamps} icon={Stamp} />
            <StatCard label="Redemptions" value={stats.totalRedemptions} icon={Gift} />
          </div>

          <div className="flex gap-3">
            <Button
              nativeButton={false}
              render={<Link href="/dashboard/customers" />}
              size="lg"
              className="flex-1 px-2"
            >
              <Users data-icon="inline-start" />
              View customers
            </Button>
            <Button
              nativeButton={false}
              variant="outline"
              render={<Link href="/dashboard/stats" />}
              size="lg"
              className="flex-1 px-2"
            >
              <Activity data-icon="inline-start" />
              View activity
            </Button>
          </div>
        </>
      ) : null}

      <div className={cn("grid gap-4", ownerMembership && "sm:grid-cols-2")}>
        <Card>
          <CardContent className="flex flex-col gap-3">
            <div className="flex items-center gap-2.5">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                <ScanLine className="size-4.5" aria-hidden="true" />
              </span>
              <CardTitle as="h2">Staff tools</CardTitle>
            </div>
            <p className="text-sm text-muted-foreground">
              Scan a customer&apos;s QR code to add stamps or redeem rewards.
            </p>
            <Button
              nativeButton={false}
              render={<Link href="/staff" />}
              className="mt-auto self-start"
            >
              Go to staff area
            </Button>
          </CardContent>
        </Card>

        {ownerMembership ? (
          <Card>
            <CardContent className="flex flex-col gap-3">
              <div className="flex items-center gap-2.5">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <ClipboardList className="size-4.5" aria-hidden="true" />
                </span>
                <CardTitle as="h2">Loyalty program</CardTitle>
              </div>
              <p className="text-sm text-muted-foreground">
                Set up the stamps and reward customers will see when they
                join.
              </p>
              <Button
                nativeButton={false}
                render={<Link href="/dashboard/program" />}
                className="mt-auto self-start"
              >
                Manage program
              </Button>
            </CardContent>
          </Card>
        ) : null}
      </div>

      <Card>
        <CardContent className="flex flex-col gap-3">
          <div className="flex items-center gap-2.5">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
              <Store className="size-4.5" aria-hidden="true" />
            </span>
            <CardTitle as="h2">Your businesses</CardTitle>
          </div>
          {memberships.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No business memberships yet.
            </p>
          ) : (
            <ul className="flex flex-col gap-2">
              {memberships.map((membership) => (
                <li
                  key={membership.id}
                  className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2 text-sm"
                >
                  <span className="truncate font-medium">
                    {membership.business.name}
                  </span>
                  <span
                    className={cn(
                      "shrink-0 rounded-full px-2 py-0.5 text-xs font-medium",
                      membership.role === "OWNER"
                        ? "bg-primary/10 text-primary"
                        : "bg-muted text-muted-foreground",
                    )}
                  >
                    {membership.role}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
