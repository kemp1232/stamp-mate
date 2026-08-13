import { Playfair_Display } from "next/font/google";
import { Coffee, CupSoda } from "lucide-react";
import { cn } from "@/lib/utils";
import type { LoyaltyCardStatus } from "@/generated/prisma/enums";

// This card uses the site's actual theme tokens (bg-card, bg-primary, etc.)
// rather than one-off colors, so it always matches whatever container it
// sits in (e.g. the marketing video's canvas mirrors this same palette —
// see motion/src/StampCard.tsx, kept in sync by hand).
const titleFont = Playfair_Display({ subsets: ["latin"], weight: ["700"] });

function CoffeeBean({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 40 60" fill="none" className={className} aria-hidden="true">
      <path
        d="M20 2C31 2 38 15 38 30C38 45 31 58 20 58C9 58 2 45 2 30C2 15 9 2 20 2Z"
        stroke="currentColor"
        strokeWidth="2"
      />
      <path d="M21 5C14 17 14 43 21 55" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}

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
  const isOpen = status !== "REDEEMED" && status !== "CANCELLED";

  return (
    <div className="relative overflow-hidden rounded-[28px] border border-border bg-card px-7 py-8 shadow-xl">
      <CoffeeBean className="pointer-events-none absolute -top-3 -left-3 size-16 rotate-[18deg] text-border" />
      <CoffeeBean className="pointer-events-none absolute -top-5 right-6 size-10 -rotate-12 text-border/70" />
      <CoffeeBean className="pointer-events-none absolute bottom-10 -right-4 size-14 rotate-45 text-border/70" />

      <div className="relative flex flex-col gap-6">
        <div className="text-center">
          <p className={cn(titleFont.className, "text-3xl text-foreground")}>
            {storeName}
          </p>
          <p className="mt-1 text-xs font-semibold tracking-[0.2em] text-muted-foreground uppercase">
            Loyalty card
          </p>
        </div>

        {status === "COMPLETED" ? (
          <p className="py-6 text-center text-lg font-medium text-foreground">
            🎉 Ready for your reward!
          </p>
        ) : status === "REDEEMED" ? (
          <p className="py-6 text-center text-muted-foreground">
            This card has already been redeemed.
          </p>
        ) : status === "CANCELLED" ? (
          <p className="py-6 text-center text-muted-foreground">
            This card is no longer active.
          </p>
        ) : (
          <>
            <p className="text-center text-sm text-muted-foreground">
              Hi {customerName}! You&apos;re {requiredStamps - currentStamps > 0
                ? `${requiredStamps - currentStamps} stamp${requiredStamps - currentStamps === 1 ? "" : "s"} away`
                : "all stamped up"}{" "}
              from your reward.
            </p>

            <div className="grid grid-cols-5 gap-3">
              {Array.from({ length: requiredStamps }, (_, index) => {
                const isRewardSlot = index === requiredStamps - 1;
                const filled = index < currentStamps;

                if (isRewardSlot) {
                  return (
                    <div
                      key={index}
                      className="flex aspect-square items-center justify-center rounded-full border-2 border-dashed border-primary bg-card text-[10px] font-bold tracking-wide text-primary uppercase"
                    >
                      Free
                    </div>
                  );
                }

                return (
                  <div
                    key={index}
                    className={cn(
                      "flex aspect-square items-center justify-center rounded-full",
                      filled
                        ? "bg-primary text-primary-foreground"
                        : "bg-secondary text-muted-foreground/40",
                    )}
                  >
                    <Coffee className="size-4" aria-hidden="true" />
                  </div>
                );
              })}
            </div>
            <p className="-mt-2 text-center text-sm text-muted-foreground">
              {currentStamps} / {requiredStamps} stamps
            </p>
          </>
        )}

        {isOpen ? (
          <div className="rounded-xl border border-dashed border-primary/40 bg-secondary/40 p-3 text-center">
            <p className="text-xs font-semibold tracking-[0.15em] text-muted-foreground uppercase">
              Reward
            </p>
            <p className="text-lg font-medium text-foreground">{rewardText}</p>
          </div>
        ) : null}

        <div className="flex items-end justify-between gap-3">
          <CupSoda
            className="size-10 shrink-0 text-primary/70"
            aria-hidden="true"
            strokeWidth={1.5}
          />
          <div className="flex flex-col items-end gap-0.5 text-right">
            <p className="text-xs text-muted-foreground">{programName}</p>
            <p className="text-[10px] tracking-[0.15em] text-muted-foreground/70 uppercase">
              Made with StampMate
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
