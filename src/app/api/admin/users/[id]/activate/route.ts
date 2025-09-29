import { auth } from "@clerk/nextjs/server"
import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { isAdmin } from "@/lib/admin-utils"

export async function POST(
  request: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  try {
    const { userId } = await auth()
    if (!userId || !(await isAdmin(userId))) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { id } = await ctx.params
    const existing = await db.user.findUnique({ where: { id } })
    if (!existing) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    const updated = await db.user.update({ where: { id }, data: { isActive: true } })
    return NextResponse.json({ success: true, user: { id: updated.id, isActive: updated.isActive } })
  } catch (error) {
    console.error('Failed to activate user:', error)
    return NextResponse.json({ error: 'Failed to activate user' }, { status: 500 })
  }
}

