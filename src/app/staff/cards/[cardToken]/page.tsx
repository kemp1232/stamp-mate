import Link from "next/link";
import { ArrowLeft, PartyPopper, SearchX } from "lucide-react";
import { getStaffCardByToken } from "@/lib/loyalty-card";
import { requireBusinessAccess } from "@/lib/authorization";
import { StaffRole } from "@/generated/prisma/enums";
import { ErrorState } from "@/components/error-state";
import { CustomerSummaryCard } from "@/components/customer-summary-card";
import { StampControls } from "@/components/stamp-controls";
import { RedeemRewardButton } from "@/components/redeem-reward-button";
import { Button } from "@/components/ui/button";

export default async function StaffCardPage({
  params,
  searchParams,
}: {
  params: Promise<{ cardToken: string }>;
  searchParams: Promise<{ redeemed?: string }>;
}) {
  const { cardToken } = await params;
  const { redeemed } = await searchParams;

  // Login is already enforced by the /staff layout. This additionally
  // confirms the logged-in staff member belongs to *this card's* business,
  // so staff at one business can't view another business's customer cards.
  const card = await getStaffCardByToken(cardToken);

  if (!card) {
    return (
      <ErrorState
        icon={SearchX}
        title="Card not found"
        description="This link may be incorrect or expired."
      />
    );
  }

  const { membership } = await requireBusinessAccess(card.businessId);
  const isOwner = membership.role === StaffRole.OWNER;

  // These only drive button disabled/visible state for UX —
  // addStamp/undoLastStamp/redeemReward independently re-validate all of
  // this on the server.
  const canAddStamp =
    card.status === "ACTIVE" &&
    card.currentStamps < card.loyaltyProgram.requiredStamps;
  const canUndo =
    card.currentStamps > 0 &&
    card.status !== "REDEEMED" &&
    card.status !== "CANCELLED";

  return (
    <div className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-6 p-6 animate-in fade-in duration-200">
      {/* CustomerSummaryCard's own title renders as an h2 — this sr-only h1
          gives the page an accessible landmark without changing the visual
          layout staff rely on mid-transaction. */}
      <h1 className="sr-only">{card.customer.name}&apos;s loyalty card</h1>
      {isOwner ? (
        <Button
          variant="outline"
          size="sm"
          className="self-start"
          nativeButton={false}
          render={<Link href="/dashboard" />}
        >
          <ArrowLeft data-icon="inline-start" />
          Back to dashboard
        </Button>
      ) : null}
      {redeemed ? (
        <p className="flex items-center justify-center gap-2 rounded-lg bg-primary/10 p-3 text-center text-sm font-medium text-primary">
          <PartyPopper className="size-4 shrink-0" aria-hidden="true" />
          Reward redeemed! This is the customer&apos;s new active card.
        </p>
      ) : null}
      <CustomerSummaryCard
        customerName={card.customer.name}
        storeName={card.loyaltyProgram.store.name}
        programName={card.loyaltyProgram.name}
        currentStamps={card.currentStamps}
        requiredStamps={card.loyaltyProgram.requiredStamps}
        rewardText={card.loyaltyProgram.rewardText}
        status={card.status}
        recentStamps={card.stamps.map((stamp) => ({
          id: stamp.id,
          createdAt: stamp.createdAt,
          staffName: stamp.staffUser.name,
        }))}
      />
      {card.status === "COMPLETED" ? (
        <RedeemRewardButton cardToken={card.cardToken} />
      ) : null}
      <StampControls
        cardToken={card.cardToken}
        canAddStamp={canAddStamp}
        canUndo={canUndo}
      />
    </div>
  );
}
