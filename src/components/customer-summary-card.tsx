import { Gift, Stamp } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { StampGrid } from "@/components/stamp-grid";
import { LoyaltyStatusBadge } from "@/components/loyalty-status-badge";
import type { LoyaltyCardStatus } from "@/generated/prisma/enums";

export type RecentStamp = {
  id: string;
  createdAt: Date;
  staffName: string;
};

export function CustomerSummaryCard({
  customerName,
  storeName,
  programName,
  currentStamps,
  requiredStamps,
  rewardText,
  status,
  recentStamps,
}: {
  customerName: string;
  storeName: string;
  programName: string;
  currentStamps: number;
  requiredStamps: number;
  rewardText: string;
  status: LoyaltyCardStatus;
  recentStamps: RecentStamp[];
}) {
  return (
    <Card>
      <CardHeader>
        <CardDescription>
          {storeName} · {programName}
        </CardDescription>
        <div className="flex items-center justify-between gap-2">
          <CardTitle as="h2">{customerName}</CardTitle>
          <LoyaltyStatusBadge status={status} />
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <StampGrid currentStamps={currentStamps} requiredStamps={requiredStamps} />
        <p className="text-center text-sm text-muted-foreground">
          {currentStamps} / {requiredStamps} stamps
        </p>

        <div className="flex items-center gap-3 rounded-lg border p-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
            <Gift className="size-4.5" aria-hidden="true" />
          </span>
          <div>
            <p className="text-sm text-muted-foreground">Reward</p>
            <p className="font-medium">{rewardText}</p>
          </div>
        </div>

        <div>
          <p className="mb-1 text-sm text-muted-foreground">
            Recent stamp history
          </p>
          {recentStamps.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No stamps recorded yet.
            </p>
          ) : (
            <ul className="flex flex-col divide-y">
              {recentStamps.map((stamp) => (
                <li
                  key={stamp.id}
                  className="flex items-center gap-2.5 py-2 first:pt-0 last:pb-0 text-sm text-muted-foreground"
                >
                  <Stamp className="size-3.5 shrink-0" aria-hidden="true" />
                  <span>
                    +1 stamp by {stamp.staffName} ·{" "}
                    {stamp.createdAt.toLocaleString(undefined, {
                      month: "short",
                      day: "numeric",
                      hour: "numeric",
                      minute: "2-digit",
                    })}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
