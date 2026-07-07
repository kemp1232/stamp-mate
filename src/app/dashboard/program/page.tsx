import { requireOwnedBusiness } from "@/lib/authorization";
import { getOrCreateDefaultStore } from "@/lib/store";
import { prisma } from "@/lib/prisma";
import { getAppUrl } from "@/lib/url";
import { StoreJoinQRCode } from "@/components/store-join-qr-code";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ProgramForm } from "./program-form";

export default async function ProgramPage() {
  const { membership } = await requireOwnedBusiness();
  const store = await getOrCreateDefaultStore(membership.businessId);
  const program = await prisma.loyaltyProgram.findFirst({
    where: { storeId: store.id },
  });

  const joinUrl = `${getAppUrl()}/join/${store.slug}`;

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6 p-6 animate-in fade-in duration-200">
      <div>
        <h1 className="text-2xl font-semibold">Loyalty program</h1>
        <p className="text-muted-foreground">{store.name}</p>
      </div>
      {!program ? (
        <p className="text-sm text-muted-foreground">
          No loyalty program yet — create one below so customers can start
          collecting stamps.
        </p>
      ) : null}
      <ProgramForm businessId={membership.businessId} program={program} />
      <Card>
        <CardHeader>
          <CardTitle>Store join QR code</CardTitle>
          <CardDescription>
            Print or display this so customers can scan it to join.
            {program?.status === "INACTIVE"
              ? " Your program is inactive, so customers who scan it won't be able to join yet."
              : null}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col items-center gap-3">
          <StoreJoinQRCode url={joinUrl} />
          <p className="break-all text-center text-sm text-muted-foreground">
            {joinUrl}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
