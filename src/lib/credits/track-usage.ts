import { db } from "@/lib/db";
import { OperationType } from "@prisma/client";
import { getUserFromClerkId } from '@/lib/auth-utils';

type JsonValue = string | number | boolean | null | JsonObject | JsonArray
interface JsonObject { [key: string]: JsonValue }
interface JsonArray extends Array<JsonValue> {}

interface TrackUsageParams {
  clerkUserId: string;
  operationType: OperationType;
  creditsUsed: number;
  details?: JsonValue;
}

export async function trackUsage({
  clerkUserId,
  operationType,
  creditsUsed,
  details,
}: TrackUsageParams): Promise<void> {
  try {
    const user = await getUserFromClerkId(clerkUserId);
    
    await db.$transaction(async (tx) => {
      let creditBalance = await tx.creditBalance.findUnique({
        where: { userId: user.id },
      });

      if (!creditBalance) {
        creditBalance = await tx.creditBalance.create({
          data: {
            userId: user.id,
            clerkUserId,
            creditsRemaining: 100,
          },
        });
      }

      await tx.usageHistory.create({
        data: {
          userId: user.id,
          creditBalanceId: creditBalance.id,
          operationType,
          creditsUsed,
          details: details ?? undefined,
        },
      });

      const updated = await tx.creditBalance.updateMany({
        where: { id: creditBalance.id, creditsRemaining: { gte: creditsUsed } },
        data: {
          creditsRemaining: { decrement: creditsUsed },
          lastSyncedAt: new Date(),
        },
      });
      if (updated.count === 0) {
        throw new Error('Insufficient credits to complete this operation');
      }
    });
  } catch (error) {
    console.error("Error tracking usage:", error);
    throw error;
  }
}

export async function getUserUsageHistory(
  userId: string,
  limit = 50,
  offset = 0
) {
  const usageHistory = await db.usageHistory.findMany({
    where: { userId },
    orderBy: {
      timestamp: "desc",
    },
    take: limit,
    skip: offset,
  });

  return usageHistory;
}

export async function getUserUsageSummary(userId: string) {
  const creditBalance = await db.creditBalance.findUnique({
    where: { userId },
  });

  if (!creditBalance) {
    return {
      totalUsed: 0,
      byOperation: {},
      lastUsage: null,
    };
  }

  const usageByOperation = await db.usageHistory.groupBy({
    by: ["operationType"],
    where: { userId },
    _sum: {
      creditsUsed: true,
    },
  });

  const lastUsage = await db.usageHistory.findFirst({
    where: { userId },
    orderBy: { timestamp: "desc" },
  });

  const totalUsed = usageByOperation.reduce(
    (sum, item) => sum + (item._sum.creditsUsed || 0),
    0
  );

  return {
    totalUsed,
    byOperation: Object.fromEntries(
      usageByOperation.map((item) => [
        item.operationType,
        item._sum.creditsUsed || 0,
      ])
    ),
    lastUsage: lastUsage?.timestamp || null,
  };
}

export async function syncCreditBalance(
  userId: string,
  clerkUserId: string,
  creditsRemaining: number
): Promise<void> {
  await db.creditBalance.upsert({
    where: { userId },
    update: {
      creditsRemaining,
      lastSyncedAt: new Date(),
    },
    create: {
      userId,
      clerkUserId,
      creditsRemaining,
    },
  });
}
