// Types for billing plans management
import type { ClerkPlan } from '@/hooks/use-admin-plans';

export type BillingPlan = {
  planId?: string;
  clerkId?: string | null;
  billingSource?: 'clerk' | 'manual';
  name: string;
  credits: number;
  active?: boolean;
  sortOrder?: number;
  clerkName?: string | null;
  currency?: string | null;
  priceMonthlyCents?: number | null;
  priceYearlyCents?: number | null;
  description?: string | null;
  features?: PlanFeatureForm[];
  badge?: string | null;
  highlight?: boolean;
  ctaType?: 'checkout' | 'contact';
  ctaLabel?: string | null;
  ctaUrl?: string | null;
  isNew?: boolean;
}

export type PlanFeatureForm = {
  id: string;
  name: string;
  description: string;
  included: boolean;
}

export type SyncPreview = {
  plans: ClerkPlan[];
  previewItems: Array<{ plan: ClerkPlan; exists: boolean; matchKey?: string }>;
  missing: Array<{ id: string; name?: string }>;
}

// Re-export ClerkPlan type for convenience
export type { ClerkPlan };
