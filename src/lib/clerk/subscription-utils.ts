import { clerkClient } from "@clerk/nextjs/server";
import { getPlanCredits } from "@/lib/credits/settings";

export interface SubscriptionPlan {
  id: string;
  name: string;
  credits: number;
  features: string[];
  priceMonthly?: number;
}

// Define available subscription plans
export const SUBSCRIPTION_PLANS: Record<string, SubscriptionPlan> = {
  free: {
    id: "free",
    name: "Gratuito",
    credits: 100,
    features: [
      "100 créditos por mês",
      "Recursos essenciais de IA",
      "Suporte da comunidade",
    ],
  },
  starter: {
    id: "starter",
    name: "Iniciante",
    credits: 500,
    features: [
      "500 créditos por mês",
      "Todos os recursos de IA",
      "Suporte por email",
      "Funcionalidade de exportação",
    ],
    priceMonthly: 9,
  },
  professional: {
    id: "professional",
    name: "Profissional",
    credits: 2000,
    features: [
      "2000 créditos por mês",
      "Processamento prioritário de IA",
      "Suporte prioritário",
      "Análises avançadas",
    ],
    priceMonthly: 29,
  },
  enterprise: {
    id: "enterprise",
    name: "Empresarial",
    credits: 10000,
    features: [
      "10000 créditos por mês",
      "Tudo do Profissional",
      "Modelos de IA personalizados",
      "Suporte dedicado",
      "Garantias de SLA",
      "Integrações personalizadas",
    ],
    priceMonthly: 0, // Custom pricing
  },
};

// Initialize user subscription on signup
export async function initializeUserSubscription(clerkUserId: string) {
  const now = new Date();
  const billingPeriodEnd = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

  const client = await clerkClient();
  const freeCredits = await getPlanCredits('free')
  await client.users.updateUser(clerkUserId, {
    publicMetadata: {
      subscriptionPlan: "free",
      creditsRemaining: freeCredits,
      creditsTotal: freeCredits,
      billingPeriodEnd: billingPeriodEnd.toISOString(),
    },
    privateMetadata: {
      billingPeriodStart: now.toISOString(),
      lastCreditRefresh: now.toISOString(),
    },
  });
}

// Handle subscription change
export async function handleSubscriptionChange(
  clerkUserId: string,
  newPlan: string,
  prorated: boolean = true
) {
  const client = await clerkClient();
  const user = await client.users.getUser(clerkUserId);
  const currentPlan = (user.publicMetadata as { subscriptionPlan?: string; creditsRemaining?: number; billingPeriodEnd?: string }).subscriptionPlan || "free";
  const currentCredits = (user.publicMetadata as { creditsRemaining?: number }).creditsRemaining || 0;

  if (currentPlan === newPlan) return;

  const newPlanData = SUBSCRIPTION_PLANS[newPlan];
  if (!newPlanData) {
    throw new Error(`Invalid plan: ${newPlan}`);
  }

  let newCredits = await getPlanCredits(newPlan);

  // If upgrading and prorated, add the difference
  if (prorated && SUBSCRIPTION_PLANS[currentPlan].credits < newPlanData.credits) {
    const creditDifference = (await getPlanCredits(newPlan)) - (await getPlanCredits(currentPlan));
    const billingPeriodEnd = new Date((user.publicMetadata as { billingPeriodEnd?: string }).billingPeriodEnd as string);
    const now = new Date();
    const daysRemaining = Math.max(0, Math.ceil((billingPeriodEnd.getTime() - now.getTime()) / (24 * 60 * 60 * 1000)));
    const daysInPeriod = 30;
    const proratedCredits = Math.floor((creditDifference * daysRemaining) / daysInPeriod);
    newCredits = currentCredits + proratedCredits;
  }

  await client.users.updateUser(clerkUserId, {
    publicMetadata: {
      ...user.publicMetadata,
      subscriptionPlan: newPlan,
      creditsRemaining: newCredits,
      creditsTotal: await getPlanCredits(newPlan),
    },
  });
}

// Check if user has access to a feature based on their plan
export async function hasFeatureAccess(
  clerkUserId: string,
  feature: string
): Promise<boolean> {
  const client = await clerkClient();
  const user = await client.users.getUser(clerkUserId);
  const plan = (user.publicMetadata as { subscriptionPlan?: string }).subscriptionPlan || "free";

  // Define feature access by plan
  const featureAccess: Record<string, string[]> = {
    exportData: ["starter", "professional", "enterprise"],
    advancedAnalytics: ["professional", "enterprise"],
    teamCollaboration: ["professional", "enterprise"],
    customAIModels: ["enterprise"],
    unlimitedProjects: ["professional", "enterprise"],
  };

  const allowedPlans = featureAccess[feature];
  if (!allowedPlans) return true; // Feature not restricted

  return allowedPlans.includes(plan);
}

// Get user's current plan details
export async function getUserPlanDetails(clerkUserId: string) {
  const client = await clerkClient();
  const user = await client.users.getUser(clerkUserId);
  const planId = (user.publicMetadata as { subscriptionPlan?: string }).subscriptionPlan || "free";
  const plan = SUBSCRIPTION_PLANS[planId];

  return {
    ...plan,
    creditsRemaining: (user.publicMetadata as { creditsRemaining?: number }).creditsRemaining || 0,
    creditsTotal: (user.publicMetadata as { creditsTotal?: number }).creditsTotal || plan.credits,
    billingPeriodEnd: (user.publicMetadata as { billingPeriodEnd?: string }).billingPeriodEnd,
  };
}
