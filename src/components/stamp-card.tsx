import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { StampGrid } from "@/components/stamp-grid";
import type { LoyaltyCardStatus } from "@/generated/prisma/enums";

export function StampCard({
  storeName,
  programName,
  customerName,
  currentStamps,
  requiredStamps,
  rewardText,
  status,
}: {
  storeName: string;
  programName: string;
  customerName: string;
  currentStamps: number;
  requiredStamps: number;
  rewardText: string;
  status: LoyaltyCardStatus;
}) {
  return (
    <Card>
      <CardHeader>
        <CardDescription>{storeName}</CardDescription>
        <CardTitle>{programName}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <p className="text-sm text-muted-foreground">Hi {customerName}!</p>

        {status === "COMPLETED" ? (
          <p className="text-center text-lg font-medium">
            🎉 Ready for reward!
          </p>
        ) : status === "REDEEMED" ? (
          <p className="text-center text-muted-foreground">
            This card has already been redeemed.
          </p>
        ) : status === "CANCELLED" ? (
          <p className="text-center text-muted-foreground">
            This card is no longer active.
          </p>
        ) : (
          <>
            <StampGrid
              currentStamps={currentStamps}
              requiredStamps={requiredStamps}
            />
            <p className="text-center text-sm text-muted-foreground">
              {currentStamps} / {requiredStamps} stamps
            </p>
          </>
        )}

        <div className="rounded-lg border p-3 text-center">
          <p className="text-sm text-muted-foreground">Reward</p>
          <p className="text-lg font-medium">{rewardText}</p>
        </div>
      </CardContent>
    </Card>
  );
}
