import { getCustomerCardByToken } from "@/lib/loyalty-card";
import { getAppUrl } from "@/lib/url";
import { StampCard } from "@/components/stamp-card";
import { CustomerQRCode } from "@/components/customer-qr-code";
import { ErrorState } from "@/components/error-state";

export default async function CardPage({
  params,
}: {
  params: Promise<{ cardToken: string }>;
}) {
  const { cardToken } = await params;

  // Card tokens are bearer access to this public display only — no login is
  // required or expected here.
  const card = await getCustomerCardByToken(cardToken);

  if (!card) {
    return (
      <ErrorState
        title="Card not found"
        description="This link may be incorrect or expired."
      />
    );
  }

  const staffCardUrl = `${getAppUrl()}/staff/cards/${card.cardToken}`;

  return (
    <div className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-6 p-6">
      <StampCard
        storeName={card.loyaltyProgram.store.name}
        programName={card.loyaltyProgram.name}
        customerName={card.customer.name}
        currentStamps={card.currentStamps}
        requiredStamps={card.loyaltyProgram.requiredStamps}
        rewardText={card.loyaltyProgram.rewardText}
        status={card.status}
      />
      <div className="flex flex-col items-center gap-2">
        <CustomerQRCode url={staffCardUrl} />
        <p className="text-center text-sm text-muted-foreground">
          Show this QR to staff when you buy.
        </p>
      </div>
    </div>
  );
}
