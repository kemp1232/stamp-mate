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
    <div className="overflow-hidden rounded-3xl bg-card shadow-xl ring-1 ring-foreground/10">
      <div className="bg-gradient-to-br from-primary to-primary/70 px-6 py-5 text-primary-foreground">
        <p className="text-xs font-medium tracking-wide uppercase opacity-80">
          {storeName}
        </p>
        <p className="text-xl font-semibold">{programName}</p>
      </div>

      <div className="relative border-t-2 border-dashed border-foreground/15">
        <div className="absolute top-1/2 -left-3 size-6 -translate-y-1/2 rounded-full bg-background" />
        <div className="absolute top-1/2 -right-3 size-6 -translate-y-1/2 rounded-full bg-background" />
      </div>

      <div className="flex flex-col gap-4 p-6">
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

        <div className="rounded-xl border border-dashed border-primary/30 bg-primary/5 p-3 text-center">
          <p className="text-sm text-muted-foreground">Reward</p>
          <p className="text-lg font-medium">{rewardText}</p>
        </div>
      </div>
    </div>
  );
}
