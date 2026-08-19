import { QrCode, Sparkles } from "lucide-react";
import { requireOwnedBusiness } from "@/lib/authorization";
import { getOrCreateDefaultStore } from "@/lib/store";
import { prisma } from "@/lib/prisma";
import { getAppUrl } from "@/lib/url";
import { cn } from "@/lib/utils";
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
        <div className="flex items-center gap-2.5">
          <h1 className="text-2xl font-semibold">Loyalty program</h1>
          {program ? (
            <span
              className={cn(
                "shrink-0 rounded-full px-2 py-0.5 text-xs font-medium",
                program.status === "ACTIVE"
                  ? "bg-primary/10 text-primary"
                  : "bg-muted text-muted-foreground",
              )}
            >
              {program.status === "ACTIVE" ? "Active" : "Inactive"}
            </span>
          ) : null}
        </div>
        <p className="text-muted-foreground">{store.name}</p>
      </div>

      {!program ? (
        <div className="flex items-start gap-3 rounded-xl border border-dashed border-primary/40 bg-primary/5 p-4">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
            <Sparkles className="size-4.5" aria-hidden="true" />
          </span>
          <p className="text-sm text-muted-foreground">
            No loyalty program yet — create one below so customers can start
            collecting stamps.
          </p>
        </div>
      ) : null}

      <ProgramForm businessId={membership.businessId} program={program} />

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2.5">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
              <QrCode className="size-4.5" aria-hidden="true" />
            </span>
            <CardTitle as="h2">Store join QR code</CardTitle>
          </div>
          <CardDescription>
            Print or display this so customers can scan it to join.
            {program?.status === "INACTIVE"
              ? " Your program is inactive, so customers who scan it won't be able to join yet."
              : null}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col items-center gap-3">
          <StoreJoinQRCode url={joinUrl} />
          <p className="max-w-full rounded-md bg-muted px-3 py-2 text-center font-mono text-xs break-all text-muted-foreground">
            {joinUrl}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
