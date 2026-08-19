import { Gift, Stamp } from "lucide-react";
import { requireOwnedBusiness } from "@/lib/authorization";
import { getRecentActivity } from "@/lib/dashboard";
import { EmptyState } from "@/components/empty-state";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

function formatActivityTime(date: Date) {
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default async function StatsPage() {
  const { membership } = await requireOwnedBusiness();
  const { recentStamps, recentRedemptions } = await getRecentActivity(
    membership.businessId,
  );

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6 p-6 animate-in fade-in duration-300">
      <div>
        <h1 className="text-2xl font-semibold">Activity</h1>
        <p className="text-muted-foreground">Recent stamps and redemptions.</p>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2.5">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
              <Stamp className="size-4.5" aria-hidden="true" />
            </span>
            <CardTitle as="h2">Recent stamps</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          {recentStamps.length === 0 ? (
            <EmptyState icon={Stamp} title="No stamps yet" />
          ) : (
            <ul className="flex flex-col divide-y">
              {recentStamps.map((stamp) => (
                <li
                  key={stamp.id}
                  className="flex items-start gap-3 py-3 first:pt-0 last:pb-0"
                >
                  <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                    <Stamp className="size-4" aria-hidden="true" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm">
                      <span className="font-medium">
                        {stamp.loyaltyCard.customer.name}
                      </span>{" "}
                      got a stamp
                    </p>
                    <p className="text-xs text-muted-foreground">
                      By {stamp.staffUser.name}
                    </p>
                  </div>
                  <p className="shrink-0 text-xs whitespace-nowrap text-muted-foreground">
                    {formatActivityTime(stamp.createdAt)}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2.5">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
              <Gift className="size-4.5" aria-hidden="true" />
            </span>
            <CardTitle as="h2">Recent redemptions</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          {recentRedemptions.length === 0 ? (
            <EmptyState icon={Gift} title="No redemptions yet" />
          ) : (
            <ul className="flex flex-col divide-y">
              {recentRedemptions.map((redemption) => (
                <li
                  key={redemption.id}
                  className="flex items-start gap-3 py-3 first:pt-0 last:pb-0"
                >
                  <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                    <Gift className="size-4" aria-hidden="true" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm">
                      <span className="font-medium">
                        {redemption.loyaltyCard.customer.name}
                      </span>{" "}
                      redeemed{" "}
                      <span className="font-medium">
                        {redemption.loyaltyCard.loyaltyProgram.rewardText}
                      </span>
                    </p>
                    <p className="text-xs text-muted-foreground">
                      By {redemption.staffUser.name}
                    </p>
                  </div>
                  <p className="shrink-0 text-xs whitespace-nowrap text-muted-foreground">
                    {formatActivityTime(redemption.createdAt)}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
