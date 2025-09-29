import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { isAdmin } from "@/lib/admin-utils";
import type { Prisma } from "../../../../../prisma/generated/client";

export async function GET(request: Request) {
  try {
    const { userId } = await auth();
    if (!userId || !(await isAdmin(userId))) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const type = searchParams.get("type") || "all";
    const range = searchParams.get("range") || "7days";
    const q = (searchParams.get("q") || "").trim();
    const page = Math.max(1, Number(searchParams.get("page") || 1));
    const pageSize = Math.min(100, Math.max(1, Number(searchParams.get("pageSize") || 25)));

    const whereClause: Prisma.UsageHistoryWhereInput = { AND: [] };
    if (type !== "all") {
      whereClause.AND!.push({ operationType: type as any });
    }

    if (range !== "all") {
      const now = new Date();
      const startDate = new Date();
      switch (range) {
        case "24hours":
          startDate.setHours(now.getHours() - 24);
          break;
        case "7days":
          startDate.setDate(now.getDate() - 7);
          break;
        case "30days":
          startDate.setDate(now.getDate() - 30);
          break;
      }
      whereClause.AND!.push({ timestamp: { gte: startDate } });
    }

    if (q) {
      whereClause.AND!.push({
        user: {
          is: {
            OR: [
              { name: { contains: q, mode: 'insensitive' } },
              { email: { contains: q, mode: 'insensitive' } },
            ],
          },
        },
      });
    }

    const [total, usageHistory] = await Promise.all([
      db.usageHistory.count({ where: whereClause }),
      db.usageHistory.findMany({
        where: whereClause,
        include: {
          user: { select: { name: true, email: true } },
        },
        orderBy: { timestamp: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    return NextResponse.json({ data: usageHistory, total, page, pageSize });
  } catch (error) {
    console.error("Failed to fetch usage history:", error);
    return NextResponse.json(
      { error: "Failed to fetch usage history" },
      { status: 500 }
    );
  }
}
