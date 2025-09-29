import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { OperationType } from "@/lib/prisma-types";
import { isAdmin } from "@/lib/admin-utils";

export async function PUT(
  request: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  try {
    const { userId } = await auth();

    if (!userId || !(await isAdmin(userId))) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { adjustment } = await request.json();

    if (typeof adjustment !== "number") {
      return NextResponse.json(
        { error: "Invalid adjustment amount" },
        { status: 400 }
      );
    }

    const { id } = await ctx.params
    const creditBalance = await db.creditBalance.findUnique({
      where: { id },
    });

    if (!creditBalance) {
      return NextResponse.json(
        { error: "Credit balance not found" },
        { status: 404 }
      );
    }

    const newBalance = Math.max(0, creditBalance.creditsRemaining + adjustment);

    const updated = await db.creditBalance.update({
      where: { id },
      data: {
        creditsRemaining: newBalance,
        lastSyncedAt: new Date(),
      },
    });

    if (adjustment !== 0) {
      await db.usageHistory.create({
        data: {
          userId: creditBalance.userId,
          creditBalanceId: creditBalance.id,
          operationType: OperationType.AI_TEXT_CHAT,
          creditsUsed: Math.abs(adjustment),
          details: {
            type: "admin_adjustment",
            adjustment,
            adminId: userId,
            reason: "Manual adjustment by admin",
          },
        },
      });
    }

    return NextResponse.json(updated);
  } catch (error) {
    console.error("Failed to adjust credits:", error);
    return NextResponse.json(
      { error: "Failed to adjust credits" },
      { status: 500 }
    );
  }
}
