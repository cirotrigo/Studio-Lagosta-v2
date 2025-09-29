import { getUserFromClerkId } from '@/lib/auth-utils';
import { db } from '@/lib/db';
import { FeatureKey } from "@/lib/credits/feature-config";
import { getFeatureCost } from "@/lib/credits/settings";
import { InsufficientCreditsError } from "@/lib/credits/errors";

// Get user's credit data from database
export async function getUserCredits(clerkUserId: string) {
  const user = await getUserFromClerkId(clerkUserId);
  
  // Get credit balance from database
  let creditBalance = await db.creditBalance.findUnique({
    where: { userId: user.id }
  });

  // If not found, create with 0 credits by default
  if (!creditBalance) {
    creditBalance = await db.creditBalance.create({
      data: {
        userId: user.id,
        clerkUserId: clerkUserId,
        creditsRemaining: 0,
      }
    });
  }

  return {
    user,
    creditBalance,
    creditsRemaining: creditBalance.creditsRemaining,
  };
}

// Validate if user has enough credits for an operation
export async function validateCredits(
  clerkUserId: string,
  feature: FeatureKey
): Promise<{ creditsRemaining: number; creditsRequired: number }> {
  const creditsRequired = await getFeatureCost(feature);
  const { creditsRemaining } = await getUserCredits(clerkUserId);

  if (creditsRemaining < creditsRequired) {
    throw new InsufficientCreditsError(
      creditsRequired,
      creditsRemaining
    );
  }

  return {
    creditsRemaining,
    creditsRequired,
  };
}

// Update user's credits after an operation
export async function deductCredits(
  clerkUserId: string,
  feature: FeatureKey
): Promise<number> {
  const creditsToDeduct = await getFeatureCost(feature);
  const { creditBalance } = await getUserCredits(clerkUserId);
  
  const newCredits = Math.max(0, creditBalance.creditsRemaining - creditsToDeduct);

  // Update credits in database
  await db.creditBalance.update({
    where: { id: creditBalance.id },
    data: {
      creditsRemaining: newCredits,
      lastSyncedAt: new Date(),
    }
  });

  return newCredits;
}

// Simple credit refresh (can be expanded with subscription logic later)
export async function refreshUserCredits(
  clerkUserId: string, 
  newCredits: number
): Promise<void> {
  const { user } = await getUserCredits(clerkUserId);
  
  await db.creditBalance.upsert({
    where: { userId: user.id },
    update: {
      creditsRemaining: newCredits,
      lastSyncedAt: new Date(),
    },
    create: {
      userId: user.id,
      clerkUserId: clerkUserId,
      creditsRemaining: newCredits,
    }
  });
}

// Increment user's credits by a positive amount
export async function addUserCredits(
  clerkUserId: string,
  amount: number
): Promise<number> {
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error('addUserCredits: amount must be a positive number')
  }

  const { creditBalance } = await getUserCredits(clerkUserId)

  const updated = await db.creditBalance.update({
    where: { id: creditBalance.id },
    data: {
      creditsRemaining: creditBalance.creditsRemaining + Math.floor(amount),
      lastSyncedAt: new Date(),
    },
  })

  return updated.creditsRemaining
}
