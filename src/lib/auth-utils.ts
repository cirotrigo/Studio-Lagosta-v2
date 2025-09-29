import { db } from '@/lib/db';
import { auth } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';


export async function getUserFromClerkId(clerkId: string) {
  let user = await db.user.findUnique({
    where: { clerkId }
  });

  if (!user) {
    // Create user if doesn't exist
    user = await db.user.create({
      data: { clerkId }
    });
  }

  return user;
}

export function createAuthErrorResponse(message: string, status: number = 401) {
  return NextResponse.json(
    { error: message, success: false },
    { status }
  );
}

export async function validateUserAuthentication() {
  const { userId } = await auth();
  
  if (!userId) {
    throw new Error('Unauthorized');
  }
  
  return userId;
}
