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

export async function getCustomerList(businessId: string) {
  const customers = await prisma.customer.findMany({
    where: { businessId },
    orderBy: { createdAt: "desc" },
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

  return customers.map((customer) => {
    const card = customer.loyaltyCards[0];
    return {
      id: customer.id,
      name: customer.name,
      status: card?.status ?? null,
      currentStamps: card?._count.stamps ?? 0,
      requiredStamps: card?.loyaltyProgram.requiredStamps ?? 0,
      lastActivity: card?.stamps[0]?.createdAt ?? card?.createdAt ?? null,
    };
  });
}
