import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { db } from '@/lib/db';
import { getUserFromClerkId } from '@/lib/auth-utils';

export async function GET() {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const user = await getUserFromClerkId(userId);
    const balance = await db.creditBalance.findUnique({ where: { userId: user.id } });

    if (!balance) {
      return NextResponse.json({ creditsRemaining: 0, lastSyncedAt: null });
    }

    return NextResponse.json({
      creditsRemaining: balance.creditsRemaining,
      lastSyncedAt: balance.lastSyncedAt,
    });
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}


