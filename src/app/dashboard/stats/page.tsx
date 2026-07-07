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
          <CardTitle>Recent stamps</CardTitle>
        </CardHeader>
        <CardContent>
          {recentStamps.length === 0 ? (
            <EmptyState title="No stamps yet" />
          ) : (
            <ul className="flex flex-col gap-2">
              {recentStamps.map((stamp) => (
                <li key={stamp.id} className="text-sm text-muted-foreground">
                  +1 stamp for {stamp.loyaltyCard.customer.name} by{" "}
                  {stamp.staffUser.name} · {formatActivityTime(stamp.createdAt)}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Recent redemptions</CardTitle>
        </CardHeader>
        <CardContent>
          {recentRedemptions.length === 0 ? (
            <EmptyState title="No redemptions yet" />
          ) : (
            <ul className="flex flex-col gap-2">
              {recentRedemptions.map((redemption) => (
                <li
                  key={redemption.id}
                  className="text-sm text-muted-foreground"
                >
                  {redemption.loyaltyCard.customer.name} redeemed{" "}
                  {redemption.loyaltyCard.loyaltyProgram.rewardText} by{" "}
                  {redemption.staffUser.name} ·{" "}
                  {formatActivityTime(redemption.createdAt)}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
