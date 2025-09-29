import { auth } from "@clerk/nextjs/server"
import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { OperationType } from "@/lib/prisma-types"
import { isAdmin } from "@/lib/admin-utils"

export async function PUT(request: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { userId } = await auth()
    if (!userId || !(await isAdmin(userId))) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await request.json().catch(() => ({}))
    const { credits, adjustment } = body as { credits?: number; adjustment?: number }

    const { id } = await ctx.params
    const creditBalance = await db.creditBalance.findUnique({
      where: { userId: id },
    })

    if (!creditBalance) {
      return NextResponse.json({ error: "Credit balance not found" }, { status: 404 })
    }

    let newBalance: number
    let delta = 0
    if (typeof credits === "number") {
      newBalance = Math.max(0, Math.floor(credits))
      delta = newBalance - creditBalance.creditsRemaining
    } else if (typeof adjustment === "number") {
      delta = Math.floor(adjustment)
      newBalance = Math.max(0, creditBalance.creditsRemaining + delta)
    } else {
      return NextResponse.json({ error: "Provide 'credits' or 'adjustment' number" }, { status: 400 })
    }

    const updated = await db.creditBalance.update({
      where: { id: creditBalance.id },
      data: { creditsRemaining: newBalance, lastSyncedAt: new Date() },
    })

    if (delta !== 0) {
      await db.usageHistory.create({
        data: {
          userId: creditBalance.userId,
          creditBalanceId: creditBalance.id,
          // Reuse existing enum, mark as admin adjustment in details
          operationType: OperationType.AI_TEXT_CHAT,
          creditsUsed: Math.abs(delta),
          details: { type: "admin_adjustment", delta, adminId: userId, reason: "Manual set/adjust by admin" },
        },
      })
    }

    return NextResponse.json(updated)
  } catch (error) {
    console.error("Failed to set/adjust credits:", error)
    return NextResponse.json({ error: "Failed to set/adjust credits" }, { status: 500 })
  }
}
