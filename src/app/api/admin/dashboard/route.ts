import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { isAdmin } from "@/lib/admin-utils";
import { SUBSCRIPTION_PLANS } from "@/lib/clerk/subscription-utils";

export async function GET() {
  try {
    const { userId } = await auth();
    
    if (!userId || !(await isAdmin(userId))) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const [totalUsers] = await Promise.all([
      db.user.count(),
    ])

    const last30Days = new Date();
    last30Days.setDate(last30Days.getDate() - 30);

    // Count active users in last 30 days (based on usage)
    const activeUsers = await db.usageHistory.findMany({
      where: { timestamp: { gte: last30Days } },
      distinct: ["userId"],
      select: { userId: true },
    })
    
    // Build months range: last 6 months
    const months = Array.from({ length: 6 }).map((_, i) => {
      const d = new Date()
      d.setMonth(d.getMonth() - (5 - i))
      return d
    })

    // Load all subscription events up to end of current month for reconstruction
    const endOfCurrentMonth = new Date(months[months.length - 1].getFullYear(), months[months.length - 1].getMonth() + 1, 0, 23, 59, 59, 999)
    const events = await db.subscriptionEvent.findMany({
      where: {
        occurredAt: { lte: endOfCurrentMonth },
      },
      orderBy: { occurredAt: 'asc' },
    })

    const planPrices: Record<string, number> = Object.fromEntries(
      Object.entries(SUBSCRIPTION_PLANS).map(([k, v]) => [k, v.priceMonthly || 0])
    )

    function monthEnd(d: Date) {
      return new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999)
    }
    function monthStart(d: Date) {
      return new Date(d.getFullYear(), d.getMonth(), 1, 0, 0, 0, 0)
    }

    const mrrSeries = [] as { label: string; value: number }[]
    const arrSeries = [] as { label: string; value: number }[]
    const churnSeries = [] as { label: string; value: number }[]

    let prevActiveCount = 0
    for (const d of months) {
      const label = d.toLocaleString('default', { month: 'short' })
      const end = monthEnd(d)
      const start = monthStart(d)
      // Latest status per user at month end
      const latestByUser = new Map<string, { status: string; planKey?: string; occurredAt: Date }>()
      for (const e of events) {
        if (e.occurredAt <= end) {
          const prev = latestByUser.get(e.clerkUserId)
          if (!prev || prev.occurredAt < e.occurredAt) {
            latestByUser.set(e.clerkUserId, { status: e.status, planKey: e.planKey ?? undefined, occurredAt: e.occurredAt })
          }
        } else {
          break
        }
      }
      // Active paid users and MRR
      let mrr = 0
      let activeCount = 0
      for (const v of latestByUser.values()) {
        if (v.status === 'active') {
          const price = planPrices[v.planKey || 'free'] || 0
          if (price > 0) mrr += price
          activeCount += 1
        }
      }
      mrrSeries.push({ label, value: mrr })
      arrSeries.push({ label, value: mrr * 12 })
      // Churn = canceled/deleted events in month divided by previous active
      const canceledInMonth = events.filter(e => e.occurredAt >= start && e.occurredAt <= end && (e.status === 'canceled' || e.status === 'deleted' || e.status === 'past_due')).length
      const churnRate = prevActiveCount > 0 ? (canceledInMonth / prevActiveCount) * 100 : 0
      churnSeries.push({ label, value: Number(churnRate.toFixed(1)) })
      prevActiveCount = activeCount
    }

    return NextResponse.json({
      totalUsers,
      activeUsers: activeUsers.length,
      mrrSeries,
      arrSeries,
      churnSeries,
    });
  } catch (error) {
    console.error("Dashboard stats error:", error);
    return NextResponse.json(
      { error: "Failed to fetch dashboard stats" },
      { status: 500 }
    );
  }
}
