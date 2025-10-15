import type { ClerkPlanFeature, ClerkPlanMoney, ClerkPlanNormalized } from './commerce-plan-types'

const CLERK_PLAN_ENDPOINTS = ['https://api.clerk.com/v1/commerce/plans']

function parseCurrency(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed ? trimmed.toLowerCase() : null
}

function parseCurrencySymbol(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed || null
}

function parseAmountValue(value: unknown): number | null {
  if (value == null) return null
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return null
    return Number.isInteger(value) ? value : Math.round(value * 100)
  }
  if (typeof value === 'string') {
    const normalized = value.replace(/,/g, '.').replace(/[^0-9.\-]/g, '')
    if (!normalized) return null
    const parsed = Number(normalized)
    if (!Number.isFinite(parsed)) return null
    return Number.isInteger(parsed) ? parsed : Math.round(parsed * 100)
  }
  return null
}

function parseMoney(
  raw: unknown,
  fallbackCurrency: string | null,
  fallbackCurrencySymbol: string | null,
  fallbackFormatted?: string | null,
): ClerkPlanMoney | null {
  if (raw == null) {
    if (fallbackFormatted) {
      return {
        amount: null,
        currency: fallbackCurrency,
        currencySymbol: fallbackCurrencySymbol,
        formatted: fallbackFormatted,
      }
    }
    return null
  }
  if (typeof raw === 'number' || typeof raw === 'string') {
    const amount = parseAmountValue(raw)
    if (amount == null) return null
    return {
      amount,
      currency: fallbackCurrency,
      currencySymbol: fallbackCurrencySymbol,
      formatted: fallbackFormatted ?? null,
    }
  }
  const amount = parseAmountValue((raw as Record<string, unknown>).amount ?? (raw as Record<string, unknown>).value)
  const rawObj = raw as Record<string, unknown>
  if (amount == null && !fallbackFormatted && !rawObj.amount_formatted) return null
  const currency = parseCurrency(rawObj.currency) ?? fallbackCurrency
  const currencySymbol = parseCurrencySymbol(rawObj.currency_symbol) ?? fallbackCurrencySymbol
  const formatted = typeof rawObj.amount_formatted === 'string'
    ? rawObj.amount_formatted
    : fallbackFormatted ?? null
  return {
    amount,
    currency,
    currencySymbol,
    formatted,
  }
}

function safeString(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed || null
}

function safeBoolean(value: unknown): boolean | null {
  if (typeof value === 'boolean') return value
  if (typeof value === 'string') {
    const lowered = value.toLowerCase()
    if (['true', '1', 'yes'].includes(lowered)) return true
    if (['false', '0', 'no'].includes(lowered)) return false
  }
  return null
}

function safeNumber(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  if (typeof value === 'string') {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : null
  }
  return null
}

function normalizePlan(raw: unknown): ClerkPlanNormalized | null {
  const rawObj = raw as Record<string, unknown>
  const id = safeString(rawObj?.id || rawObj?.plan_id || rawObj?.key || rawObj?.slug)
  if (!id) return null

  const baseCurrency = parseCurrency(rawObj?.currency)
    ?? parseCurrency((rawObj?.fee as Record<string, unknown>)?.currency)
    ?? parseCurrency((rawObj?.annual_fee as Record<string, unknown>)?.currency)
    ?? null
  const baseSymbol = parseCurrencySymbol(rawObj?.currency_symbol)
    ?? parseCurrencySymbol((rawObj?.fee as Record<string, unknown>)?.currency_symbol)
    ?? parseCurrencySymbol((rawObj?.annual_fee as Record<string, unknown>)?.currency_symbol)
    ?? null

  const monthlyPrice = parseMoney(
    rawObj?.amount,
    baseCurrency,
    baseSymbol,
    typeof rawObj?.amount_formatted === 'string' ? rawObj.amount_formatted : null,
  )
  const annualMonthlyPrice = parseMoney(
    rawObj?.annual_monthly_amount,
    monthlyPrice?.currency ?? baseCurrency,
    monthlyPrice?.currencySymbol ?? baseSymbol,
    typeof rawObj?.annual_monthly_amount_formatted === 'string'
      ? rawObj.annual_monthly_amount_formatted
      : null,
  )
  const annualPrice = parseMoney(
    rawObj?.annual_amount,
    monthlyPrice?.currency ?? baseCurrency,
    monthlyPrice?.currencySymbol ?? baseSymbol,
    typeof rawObj?.annual_amount_formatted === 'string'
      ? rawObj.annual_amount_formatted
      : null,
  )

  const setupFee = parseMoney(rawObj?.fee, baseCurrency, baseSymbol)
  const annualMonthlySetupFee = parseMoney(rawObj?.annual_monthly_fee, baseCurrency, baseSymbol)
  const annualSetupFee = parseMoney(rawObj?.annual_fee, baseCurrency, baseSymbol)

  const currency = monthlyPrice?.currency ?? annualPrice?.currency ?? baseCurrency
  const currencySymbol = monthlyPrice?.currencySymbol ?? annualPrice?.currencySymbol ?? baseSymbol

  const features: ClerkPlanFeature[] = Array.isArray(rawObj?.features)
    ? (rawObj.features as unknown[]).map((feature: unknown) => {
      const featureObj = feature as Record<string, unknown>
      return {
        id: safeString(featureObj?.id),
        name: safeString(featureObj?.name),
        description: safeString(featureObj?.description),
        slug: safeString(featureObj?.slug),
        avatarUrl: safeString(featureObj?.avatar_url),
      }
    })
    : []

  return {
    id,
    name: safeString(rawObj?.name),
    description: safeString(rawObj?.description),
    slug: safeString(rawObj?.slug),
    productId: safeString(rawObj?.product_id),
    currency,
    currencySymbol,
    period: safeString(rawObj?.period),
    interval: safeNumber(rawObj?.interval),
    isDefault: safeBoolean(rawObj?.is_default),
    isRecurring: safeBoolean(rawObj?.is_recurring),
    publiclyVisible: safeBoolean(rawObj?.publicly_visible),
    hasBaseFee: safeBoolean(rawObj?.has_base_fee),
    payerType: Array.isArray(rawObj?.payer_type)
      ? (rawObj.payer_type as unknown[]).filter((value: unknown) => typeof value === 'string' && value.trim().length > 0)
      : [],
    forPayerType: safeString(rawObj?.for_payer_type),
    avatarUrl: safeString(rawObj?.avatar_url),
    freeTrialEnabled: safeBoolean(rawObj?.free_trial_enabled),
    freeTrialDays: safeNumber(rawObj?.free_trial_days),
    prices: {
      ...(monthlyPrice ? { month: monthlyPrice } : {}),
      ...(annualPrice ? { year: annualPrice } : {}),
      ...(annualMonthlyPrice ? { annualMonthly: annualMonthlyPrice } : {}),
      ...(setupFee ? { setupFee } : {}),
      ...(annualSetupFee ? { annualSetupFee } : {}),
      ...(annualMonthlySetupFee ? { annualMonthlySetupFee } : {}),
    },
    features,
  }
}

export async function fetchCommercePlans(): Promise<ClerkPlanNormalized[]> {
  const token = process.env.CLERK_BILLING_API_KEY || process.env.CLERK_SECRET_KEY
  if (!token) {
    throw new Error('CLERK_SECRET_KEY not configured')
  }

  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
    Accept: 'application/json',
  }

  const errors: Array<{ url: string; status?: number; message?: string }> = []

  for (const url of CLERK_PLAN_ENDPOINTS) {
    try {
      const response = await fetch(url, { method: 'GET', headers, cache: 'no-store' })
      const text = await response.text()
      if (!response.ok) {
        errors.push({ url, status: response.status, message: text?.slice(0, 500) })
        continue
      }
      let payload: unknown = null
      try {
        payload = text ? JSON.parse(text) : null
      } catch {
        payload = null
      }
      const payloadObj = payload as Record<string, unknown>
      const collection = Array.isArray(payload)
        ? payload
        : Array.isArray(payloadObj?.plans)
          ? payloadObj.plans
          : Array.isArray(payloadObj?.data)
            ? payloadObj.data
            : Array.isArray(payloadObj?.items)
              ? payloadObj.items
              : Array.isArray(payloadObj?.products)
                ? payloadObj.products
                : []

      const normalized = (collection as unknown[])
        .map((item: unknown) => normalizePlan(item))
        .filter((plan: ClerkPlanNormalized | null): plan is ClerkPlanNormalized => Boolean(plan))

      if (normalized.length > 0) {
        return normalized
      }
      errors.push({ url, message: 'No plans found in response' })
    } catch (error) {
      errors.push({ url, message: String((error as Error)?.message || error) })
    }
  }

  throw new Error(`Failed to fetch Clerk plans: ${JSON.stringify(errors)}`)
}
