import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { StampGrid } from "@/components/stamp-grid";
import type { LoyaltyCardStatus } from "@/generated/prisma/enums";

const STATUS_LABEL: Record<LoyaltyCardStatus, string> = {
  ACTIVE: "Active",
  COMPLETED: "Ready for reward",
  REDEEMED: "Redeemed",
  CANCELLED: "Cancelled",
};

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
        <CardTitle>{customerName}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">Status</span>
          <span className="font-medium">{STATUS_LABEL[status]}</span>
        </div>

        <StampGrid currentStamps={currentStamps} requiredStamps={requiredStamps} />
        <p className="text-center text-sm text-muted-foreground">
          {currentStamps} / {requiredStamps} stamps
        </p>

        <div className="rounded-lg border p-3 text-center">
          <p className="text-sm text-muted-foreground">Reward</p>
          <p className="text-lg font-medium">{rewardText}</p>
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
            <ul className="flex flex-col gap-1">
              {recentStamps.map((stamp) => (
                <li key={stamp.id} className="text-sm text-muted-foreground">
                  +1 stamp by {stamp.staffName} ·{" "}
                  {stamp.createdAt.toLocaleString(undefined, {
                    month: "short",
                    day: "numeric",
                    hour: "numeric",
                    minute: "2-digit",
                  })}
                </li>
              ))}
            </ul>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
