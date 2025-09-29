import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { isAdmin } from "@/lib/admin-utils";
import { cache, getCacheKey } from "@/lib/cache";

export async function GET(request: Request) {
  try {
    const { userId } = await auth();

    if (!userId || !(await isAdmin(userId))) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const page = Math.max(1, Number(searchParams.get("page") || 1));
    const pageSize = Math.min(100, Math.max(1, Number(searchParams.get("pageSize") || 50)));
    const search = searchParams.get("search")?.trim() || "";
    const includeUsageCount = searchParams.get("includeUsageCount") === "true";

    // Build where clause for search
    const whereClause = search ? {
      OR: [
        { name: { contains: search, mode: 'insensitive' as const } },
        { email: { contains: search, mode: 'insensitive' as const } },
      ]
    } : {};

    // Create cache key based on query parameters
    const cacheKey = getCacheKey('admin:users', page, pageSize, search, includeUsageCount.toString());

    // Try to get from cache first (only for non-search queries to avoid stale search results)
    if (!search) {
      const cached = cache.get(cacheKey);
      if (cached) {
        return NextResponse.json(cached);
      }
    }

    // Get total count and users in parallel
    const [total, users] = await Promise.all([
      db.user.count({ where: whereClause }),
      db.user.findMany({
        where: whereClause,
        include: {
          creditBalance: {
            select: {
              creditsRemaining: true,
            },
          },
          ...(includeUsageCount ? {
            _count: {
              select: {
                usageHistory: true,
              },
            },
          } : {}),
        },
        orderBy: {
          createdAt: "desc",
        },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    const result = {
      users,
      pagination: {
        page,
        pageSize,
        total,
        pages: Math.ceil(total / pageSize),
      },
    };

    // Cache the result (only for non-search queries, cache for 2 minutes)
    if (!search) {
      cache.set(cacheKey, result, 120);
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error("Failed to fetch users:", error);
    return NextResponse.json(
      { error: "Failed to fetch users" },
      { status: 500 }
    );
  }
}