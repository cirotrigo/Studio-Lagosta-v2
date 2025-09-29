import { auth, createClerkClient } from "@clerk/nextjs/server"
import { NextResponse } from "next/server"
import { isAdmin } from "@/lib/admin-utils"
import { db } from "@/lib/db"
import { refreshUserCredits } from "@/lib/credits/validate-credits"

const clerk = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY as string })
export const runtime = 'nodejs'
export const maxDuration = 300 // 5 minutes

export async function POST(request: Request) {
  try {
    const { userId } = await auth()
    if (!userId || !(await isAdmin(userId))) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Fetch a page of users from Clerk; paginate here if needed
    const { pageSize: bodyPageSize, maxPages, debug: bodyDebug, syncUsers: bodySyncUsers, syncPlans: bodySyncPlans, setCredits: bodySetCredits, overrideCredits } = await request.json().catch(() => ({}))
    const pageSize = Math.max(1, Math.min(200, bodyPageSize || 50)) // Reduced from 500 to 200
    const max = Math.max(1, Math.min(20, maxPages || 10)) // Reduced from 100 to 20
    const debug = Boolean(bodyDebug) || process.env.DEBUG_CLERK_SYNC === '1'
    const syncUsers = bodySyncUsers !== undefined ? Boolean(bodySyncUsers) : true
    const syncPlans = bodySyncPlans !== undefined ? Boolean(bodySyncPlans) : true
    const setCredits = bodySetCredits !== undefined ? Boolean(bodySetCredits) : true
    const overrideAmount = Number.isFinite(Number(overrideCredits)) ? Math.max(0, Math.floor(Number(overrideCredits))) : null

    const dlog = (...args: unknown[]) => { if (debug) console.log('[admin/users/sync]', ...args) }

    let totalProcessed = 0
    let createdUsers = 0
    let createdBalances = 0
    let activeSubscriptions = 0
    let creditsRefreshed = 0
    let pagesProcessed = 0
    const unmappedPlanIds = new Set<string>()

    const billingToken = process.env.CLERK_SECRET_KEY
    const canQueryBilling = Boolean(billingToken)

    // Canonical Clerk Billing endpoint: https://api.clerk.com/v1/users/{user_id}/billing/subscription
    async function fetchActivePlanIdForUser(userClerkId: string, headers: Record<string, string>): Promise<string | null> {
      const url = `https://api.clerk.com/v1/users/${encodeURIComponent(userClerkId)}/billing/subscription`
      const res = await fetch(url, { method: 'GET', headers, cache: 'no-store' })
      if (!res.ok) {
        console.warn('[admin/users/sync] billing/subscription request failed', { userClerkId, status: res.status })
        return null
      }
      const text = await res.text()
      let data: unknown = null
      try { data = text ? JSON.parse(text) : null } catch { data = null }
      // Accept plain object or wrapped in { data }
      console.log('[admin/users/sync] billing/subscription request succeeded', { userClerkId, status: res.status, data })

      const sub = (data && typeof data === 'object' && !Array.isArray(data) && (data as { data?: unknown }).data && typeof (data as { data?: unknown }).data === 'object') ? (data as { data?: unknown }).data as Record<string, unknown> : data as Record<string, unknown> | null
      if (!sub || typeof sub !== 'object') return null
      const subAny = sub as any
      const status = String((sub as Record<string, unknown>)?.status || '').toLowerCase()
      if (status !== 'active') return null
      // Prefer plan from subscription_items when present
      let planId: unknown = (sub as Record<string, unknown>)?.plan_id || (sub as { plan?: { id?: unknown } })?.plan?.id || null
      if (!planId && Array.isArray((sub as { subscription_items?: unknown[] })?.subscription_items) && (sub as { subscription_items?: unknown[] }).subscription_items!.length > 0) {
        const firstItem = (sub as { subscription_items: Array<Record<string, unknown>> }).subscription_items[0]
        planId = firstItem?.plan_id || (firstItem?.plan as { id?: unknown } | undefined)?.id || null
      }
      return planId ? String(planId) : null
    }

    for (let page = 0; page < max; page++) {
      const res = await clerk.users.getUserList({ limit: pageSize, offset: page * pageSize }) as unknown as { data?: Array<Record<string, unknown>> } | Array<Record<string, unknown>>
      const users: Array<Record<string, any>> = (res as { data?: Array<Record<string, any>> })?.data || (res as Array<Record<string, any>>) || []
      if (!users.length) break
      pagesProcessed++
      dlog(`page ${page + 1}/${max}: fetched ${users.length} users`)

      // Process users in batches to prevent database connection exhaustion
      const BATCH_SIZE = 10
      for (let i = 0; i < users.length; i += BATCH_SIZE) {
        const batch = users.slice(i, i + BATCH_SIZE)
        const batchPromises = batch.map(async (cu) => {
          totalProcessed++
          try {
            const clerkId = cu.id
            dlog('processing user', { clerkId })
            const primary = cu.emailAddresses?.find((e: { id?: string }) => e.id === cu.primaryEmailAddressId) || cu.emailAddresses?.[0]
            const email = primary?.emailAddress || null
            const name = [cu.firstName, cu.lastName].filter(Boolean).join(' ') || cu.firstName || null

            let dbUser = await db.user.findUnique({ where: { clerkId } })
            if (syncUsers) {
              if (!dbUser) {
                dbUser = await db.user.create({ data: { clerkId, email, name } })
                createdUsers++
              } else {
                await db.user.update({ where: { id: dbUser.id }, data: { email, name } })
              }
              if (dbUser) {
                const balance = await db.creditBalance.findUnique({ where: { userId: dbUser.id } })
                if (!balance) {
                  await db.creditBalance.create({
                    data: {
                      userId: dbUser.id,
                      clerkUserId: clerkId,
                      creditsRemaining: 0,
                    },
                  })
                  createdBalances++
                  dlog('created credit balance', { clerkId, userId: dbUser.id })
                }
              }
            }

            // Attempt to detect an active subscription for this user and refresh credits accordingly
            if (syncPlans && canQueryBilling) {
              try {
                const headers: Record<string, string> = {
                  Authorization: `Bearer ${billingToken}`,
                  'Content-Type': 'application/json',
                  Accept: 'application/json',
                }
                const planId = await fetchActivePlanIdForUser(clerkId, headers)
                dlog('subscription lookup', { clerkId, planId })
                if (planId) {
                  const plan = await db.plan.findUnique({ where: { clerkId: planId } })
                  if (plan) {
                    activeSubscriptions++
                    if (setCredits) {
                      const credits = overrideAmount != null ? overrideAmount : Math.max(0, Math.floor(plan.credits))
                      await refreshUserCredits(clerkId, credits)
                      creditsRefreshed++
                      dlog('refreshed credits', { clerkId, planId, credits, override: overrideAmount != null })
                    } else {
                      dlog('setCredits disabled; skipping credit update', { clerkId, planId })
                    }
                  } else {
                    unmappedPlanIds.add(planId)
                    dlog('plan not mapped in DB; skipping refresh', { clerkId, planId })
                  }
                } else {
                  dlog('no active subscription found', { clerkId })
                }
              } catch (subErr) {
                // Non-fatal; continue with next user
                console.error('Failed to sync subscription for user', clerkId, subErr)
              }
            }
          } catch (innerErr) {
            console.error('Sync user failed:', innerErr)
          }
        })

        // Wait for batch to complete before processing next batch
        await Promise.allSettled(batchPromises)
      }
    }

    const payload: Record<string, unknown> = {
      processed: totalProcessed,
      createdUsers,
      createdBalances,
      activeSubscriptions,
      creditsRefreshed,
    }
    if (debug) {
      payload.debug = {
        pagesProcessed,
        unmappedPlanIds: Array.from(unmappedPlanIds),
      }
    }
    return NextResponse.json(payload)
  } catch (error: unknown) {
    console.error('Sync from Clerk failed:', error)
    const err = error as { errors?: Array<{ message?: string }>; message?: string; status?: number }
    const message = err?.errors?.[0]?.message || err?.message || 'Failed to sync users'
    return NextResponse.json({ error: message }, { status: err?.status || 500 })
  }
}
