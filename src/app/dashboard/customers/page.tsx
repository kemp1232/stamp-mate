import { requireOwnedBusiness } from "@/lib/authorization";
import { getCustomerList } from "@/lib/dashboard";
import { EmptyState } from "@/components/empty-state";
import { Card, CardContent } from "@/components/ui/card";
import type { LoyaltyCardStatus } from "@/generated/prisma/enums";

const STATUS_LABEL: Record<LoyaltyCardStatus, string> = {
  ACTIVE: "Active",
  COMPLETED: "Ready for reward",
  REDEEMED: "Redeemed",
  CANCELLED: "Cancelled",
};

export default async function CustomersPage() {
  const { membership } = await requireOwnedBusiness();
  const customers = await getCustomerList(membership.businessId);

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold">Customers</h1>
        <p className="text-muted-foreground">{customers.length} total</p>
      </div>

      {customers.length === 0 ? (
        <EmptyState
          title="No customers yet"
          description="Customers will show up here after they join with your store QR code."
        />
      ) : (
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
      )}
    </div>
  );
}
