import Link from "next/link";
import { requireOwnedBusiness } from "@/lib/authorization";
import { getCustomerList } from "@/lib/dashboard";
import { EmptyState } from "@/components/empty-state";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import type { LoyaltyCardStatus } from "@/generated/prisma/enums";

const STATUS_LABEL: Record<LoyaltyCardStatus, string> = {
  ACTIVE: "Active",
  COMPLETED: "Ready for reward",
  REDEEMED: "Redeemed",
  CANCELLED: "Cancelled",
};

export default async function CustomersPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const { membership } = await requireOwnedBusiness();
  const { page: pageParam } = await searchParams;
  const requestedPage = Number(pageParam);

  const { customers, totalCount, page, totalPages } = await getCustomerList(
    membership.businessId,
    Number.isFinite(requestedPage) && requestedPage >= 1 ? requestedPage : 1,
  );

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6 p-6 animate-in fade-in duration-200">
      <div>
        <h1 className="text-2xl font-semibold">Customers</h1>
        <p className="text-muted-foreground">{totalCount} total</p>
      </div>

      {totalCount === 0 ? (
        <EmptyState
          title="No customers yet"
          description="Customers will show up here after they join with your store QR code."
        />
      ) : (
        <>
          <ul className="flex flex-col gap-3">
            {customers.map((customer) => (
              <li key={customer.id}>
                <Card>
                  <CardContent className="flex items-center justify-between gap-4">
                    <div>
                      <p className="font-medium">{customer.name}</p>
                      <p className="text-sm text-muted-foreground">
                        {customer.status
                          ? STATUS_LABEL[customer.status]
                          : "No card yet"}
                        {customer.lastActivity
                          ? ` · Last activity ${customer.lastActivity.toLocaleDateString()}`
                          : ""}
                      </p>
                    </div>
                    <p className="text-sm font-medium whitespace-nowrap">
                      {customer.currentStamps} / {customer.requiredStamps}
                    </p>
                  </CardContent>
                </Card>
              </li>
            ))}
          </ul>

          {totalPages > 1 ? (
            <div className="flex items-center justify-between gap-3">
              {page > 1 ? (
                <Button
                  variant="outline"
                  nativeButton={false}
                  render={<Link href={`/dashboard/customers?page=${page - 1}`} />}
                >
                  ← Previous
                </Button>
              ) : (
                <Button variant="outline" disabled>
                  ← Previous
                </Button>
              )}
              <p className="text-sm text-muted-foreground">
                Page {page} of {totalPages}
              </p>
              {page < totalPages ? (
                <Button
                  variant="outline"
                  nativeButton={false}
                  render={<Link href={`/dashboard/customers?page=${page + 1}`} />}
                >
                  Next →
                </Button>
              ) : (
                <Button variant="outline" disabled>
                  Next →
                </Button>
              )}
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
