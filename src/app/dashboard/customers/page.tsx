import Link from "next/link";
import { ChevronLeft, ChevronRight, Users } from "lucide-react";
import { requireOwnedBusiness } from "@/lib/authorization";
import { getCustomerList } from "@/lib/dashboard";
import { EmptyState } from "@/components/empty-state";
import { LoyaltyStatusBadge } from "@/components/loyalty-status-badge";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

function getInitials(name: string) {
  const initials = name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
  return initials || "?";
}

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
          icon={Users}
          title="No customers yet"
          description="Customers will show up here after they join with your store QR code."
        />
      ) : (
        <>
          <ul className="flex flex-col gap-3">
            {customers.map((customer) => {
              const progressPct =
                customer.requiredStamps > 0
                  ? Math.min(
                      100,
                      (customer.currentStamps / customer.requiredStamps) * 100,
                    )
                  : 0;

              return (
                <li key={customer.id}>
                  <Card>
                    <CardContent className="flex flex-col gap-3">
                      <div className="flex items-center gap-3">
                        <span
                          className="flex size-9 shrink-0 items-center justify-center rounded-full bg-muted text-sm font-semibold"
                          aria-hidden="true"
                        >
                          {getInitials(customer.name)}
                        </span>
                        <p className="min-w-0 flex-1 truncate font-medium">
                          {customer.name}
                        </p>
                        <p className="shrink-0 text-sm font-medium whitespace-nowrap">
                          {customer.currentStamps} / {customer.requiredStamps}
                        </p>
                      </div>

                      {customer.requiredStamps > 0 ? (
                        <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                          <div
                            className="h-full rounded-full bg-primary transition-[width]"
                            style={{ width: `${progressPct}%` }}
                          />
                        </div>
                      ) : null}

                      <div className="flex items-center justify-between gap-2">
                        <LoyaltyStatusBadge status={customer.status} />
                        {customer.lastActivity ? (
                          <p className="shrink-0 text-xs text-muted-foreground">
                            {customer.lastActivity.toLocaleDateString()}
                          </p>
                        ) : null}
                      </div>
                    </CardContent>
                  </Card>
                </li>
              );
            })}
          </ul>

          {totalPages > 1 ? (
            <div className="flex items-center justify-between gap-3">
              {page > 1 ? (
                <Button
                  variant="outline"
                  nativeButton={false}
                  render={<Link href={`/dashboard/customers?page=${page - 1}`} />}
                >
                  <ChevronLeft data-icon="inline-start" />
                  Previous
                </Button>
              ) : (
                <Button variant="outline" disabled>
                  <ChevronLeft data-icon="inline-start" />
                  Previous
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
                  Next
                  <ChevronRight data-icon="inline-end" />
                </Button>
              ) : (
                <Button variant="outline" disabled>
                  Next
                  <ChevronRight data-icon="inline-end" />
                </Button>
              )}
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
