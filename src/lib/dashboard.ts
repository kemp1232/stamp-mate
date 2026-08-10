import "server-only";
import { prisma } from "@/lib/prisma";

/**
 * Every query here is scoped by businessId derived from the caller's own
 * membership (never a client-supplied id) — this is the sole guard against
 * cross-business data leakage for the dashboard.
 */
export async function getDashboardStats(businessId: string) {
  const [totalCustomers, totalStamps, totalRedemptions, activeCards, completedCards] =
    await Promise.all([
      prisma.customer.count({ where: { businessId } }),
      prisma.stamp.count({ where: { loyaltyCard: { customer: { businessId } } } }),
      prisma.rewardRedemption.count({
        where: { loyaltyCard: { customer: { businessId } } },
      }),
      prisma.loyaltyCard.count({
        where: { status: "ACTIVE", customer: { businessId } },
      }),
      prisma.loyaltyCard.count({
        where: { status: "COMPLETED", customer: { businessId } },
      }),
    ]);

  return {
    totalCustomers,
    totalStamps,
    totalRedemptions,
    activeCards,
    completedCards,
  };
}

export async function getRecentActivity(businessId: string) {
  const [recentStamps, recentRedemptions] = await Promise.all([
    prisma.stamp.findMany({
      where: { loyaltyCard: { customer: { businessId } } },
      orderBy: { createdAt: "desc" },
      take: 5,
      select: {
        id: true,
        createdAt: true,
        staffUser: { select: { name: true } },
        loyaltyCard: { select: { customer: { select: { name: true } } } },
      },
    }),
    prisma.rewardRedemption.findMany({
      where: { loyaltyCard: { customer: { businessId } } },
      orderBy: { createdAt: "desc" },
      take: 5,
      select: {
        id: true,
        createdAt: true,
        staffUser: { select: { name: true } },
        loyaltyCard: {
          select: {
            customer: { select: { name: true } },
            loyaltyProgram: { select: { rewardText: true } },
          },
        },
      },
    }),
  ]);

  return { recentStamps, recentRedemptions };
}

export const CUSTOMER_LIST_PAGE_SIZE = 25;

/**
 * Paginated so the query and the rendered list stay bounded as the customer
 * count grows. `page` is 1-indexed; out-of-range input (too low, too high,
 * non-finite) is clamped into `[1, totalPages]` below, so callers can pass
 * raw, unvalidated query-string values straight through.
 */
export async function getCustomerList(
  businessId: string,
  page: number = 1,
) {
  const pageSize = CUSTOMER_LIST_PAGE_SIZE;
  const requestedPage =
    Number.isFinite(page) && page >= 1 ? Math.floor(page) : 1;

  // totalCount has to be known before we can clamp the requested page (and
  // therefore the `skip` offset), so this can't run in Promise.all with the
  // customers query the way it used to.
  const totalCount = await prisma.customer.count({ where: { businessId } });
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const safePage = Math.min(requestedPage, totalPages);

  const customers = await prisma.customer.findMany({
    where: { businessId },
    orderBy: { createdAt: "desc" },
    skip: (safePage - 1) * pageSize,
    take: pageSize,
    select: {
      id: true,
      name: true,
      loyaltyCards: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: {
          status: true,
          createdAt: true,
          loyaltyProgram: { select: { requiredStamps: true } },
          _count: { select: { stamps: true } },
          stamps: {
            orderBy: { createdAt: "desc" },
            take: 1,
            select: { createdAt: true },
          },
        },
      },
    },
  });

  return {
    customers: customers.map((customer) => {
      const card = customer.loyaltyCards[0];
      return {
        id: customer.id,
        name: customer.name,
        status: card?.status ?? null,
        currentStamps: card?._count.stamps ?? 0,
        requiredStamps: card?.loyaltyProgram.requiredStamps ?? 0,
        lastActivity: card?.stamps[0]?.createdAt ?? card?.createdAt ?? null,
      };
    }),
    totalCount,
    page: safePage,
    pageSize,
    totalPages,
  };
}
