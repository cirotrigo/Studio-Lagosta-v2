export interface ClerkPlanMoney {
  amount: number | null
  currency: string | null
  currencySymbol: string | null
  formatted: string | null
}

export interface ClerkPlanFeature {
  id: string | null
  name: string | null
  description: string | null
  slug: string | null
  avatarUrl: string | null
}

export interface ClerkPlanNormalized {
  id: string
  name: string | null
  description: string | null
  slug: string | null
  productId: string | null
  currency: string | null
  currencySymbol: string | null
  period: string | null
  interval: number | null
  isDefault: boolean | null
  isRecurring: boolean | null
  publiclyVisible: boolean | null
  hasBaseFee: boolean | null
  payerType: string[]
  forPayerType: string | null
  avatarUrl: string | null
  freeTrialEnabled: boolean | null
  freeTrialDays: number | null
  prices: {
    month?: ClerkPlanMoney
    year?: ClerkPlanMoney
    annualMonthly?: ClerkPlanMoney
    setupFee?: ClerkPlanMoney
    annualSetupFee?: ClerkPlanMoney
    annualMonthlySetupFee?: ClerkPlanMoney
  }
  features: ClerkPlanFeature[]
}
