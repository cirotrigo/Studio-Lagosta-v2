import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { db } from '@/lib/db'

type ClerkSubscriptionItem = { plan_id?: unknown; plan?: { id?: unknown } }
type ClerkSubscription = {
  status?: unknown
  plan_id?: unknown
  plan?: { id?: unknown }
  subscription_items?: ClerkSubscriptionItem[]
}

type ClerkApiResponse = { data?: ClerkSubscription } | ClerkSubscription | null

function getSafe(obj: unknown, path: (string | number)[]): unknown {
  return path.reduce<unknown>((acc, key) => {
    if (acc && typeof acc === 'object' && key in (acc as Record<string, unknown>)) {
      return (acc as Record<string, unknown>)[key as string]
    }
    return undefined
  }, obj)
}

export async function GET() {
  try {
    const { userId } = await auth()
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const token = process.env.CLERK_BILLING_API_KEY || process.env.CLERK_SECRET_KEY
    if (token) {
      try {
        const headers: Record<string, string> = {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        }
        const url = `https://api.clerk.com/v1/users/${encodeURIComponent(userId)}/billing/subscription`
        const res = await fetch(url, { method: 'GET', headers, cache: 'no-store' })
        if (res.ok) {
          const text = await res.text()
          let data: unknown = null
          try { data = text ? JSON.parse(text) : null } catch { data = null }
          const response = data as ClerkApiResponse
          const sub: ClerkSubscription | null = (response && typeof response === 'object' && 'data' in response)
            ? (response as { data?: ClerkSubscription }).data ?? null
            : (response as ClerkSubscription | null)

          const status = String(getSafe(sub, ['status']) ?? '').toLowerCase()
          if (status === 'active') {
            let planId: unknown = getSafe(sub, ['plan_id']) ?? getSafe(sub, ['plan', 'id']) ?? null
            const items = getSafe(sub, ['subscription_items'])
            if (!planId && Array.isArray(items) && items.length > 0) {
              const firstItem = items[0] as ClerkSubscriptionItem
              planId = firstItem?.plan_id ?? firstItem?.plan?.id ?? null
            }
            return NextResponse.json({ isActive: true, plan: planId ?? null })
          }
        }
      } catch {
      }
    }

    const latest = await db.subscriptionEvent.findFirst({
      where: { clerkUserId: userId },
      orderBy: { occurredAt: 'desc' },
      select: { status: true, planKey: true },
    })
    if (latest && (latest.status === 'active')) {
      return NextResponse.json({ isActive: true, plan: latest.planKey ?? null })
    }
    return NextResponse.json({ isActive: false })
  } catch {
    return NextResponse.json({ error: 'Failed to resolve subscription status' }, { status: 500 })
  }
}
