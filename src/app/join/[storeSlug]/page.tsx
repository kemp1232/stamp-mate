import { prisma } from "@/lib/prisma";
import { LoyaltyProgramStatus } from "@/generated/prisma/enums";
import { ErrorState } from "@/components/error-state";
import { JoinForm } from "./join-form";

export default async function JoinPage({
  params,
}: {
  params: Promise<{ storeSlug: string }>;
}) {
  const { storeSlug } = await params;

  const store = await prisma.store.findUnique({
    where: { slug: storeSlug },
    include: {
      loyaltyPrograms: {
        where: { status: LoyaltyProgramStatus.ACTIVE },
        take: 1,
      },
    },
  });

  if (!store) {
    return (
      <ErrorState
        title="Store not found"
        description="This join link looks incorrect. Ask the business for a new QR code."
      />
    );
  }

  const program = store.loyaltyPrograms[0];

  if (!program) {
    return (
      <ErrorState
        title={store.name}
        description="This store isn't accepting new members right now. Check back later!"
      />
    );
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-6 p-6">
      <div className="text-center">
        <h1 className="text-2xl font-semibold">{store.name}</h1>
        <p className="text-muted-foreground">{program.name}</p>
      </div>
      <div className="rounded-lg border p-4 text-center">
        <p className="text-sm text-muted-foreground">Collect stamps for</p>
        <p className="text-lg font-medium">{program.rewardText}</p>
        <p className="text-sm text-muted-foreground">
          {program.requiredStamps} stamps required
        </p>
      </div>
      <JoinForm storeSlug={store.slug} />
    </div>
  );
}
