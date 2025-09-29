import { auth, createClerkClient } from "@clerk/nextjs/server"
import { NextResponse } from "next/server"
import { isAdmin } from "@/lib/admin-utils"

const clerk = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY as string })
export const runtime = 'nodejs'

export async function GET() {
  try {
    const { userId } = await auth()
    if (!userId || !(await isAdmin(userId))) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Fetch invitations; filter to pending/unaccepted
    const list = await clerk.invitations.getInvitationList({}) as unknown as {
      data?: Array<{
        id: string;
        emailAddress?: string;
        email_address?: string;
        status: string;
        createdAt?: string;
        created_at?: string;
        updatedAt?: string;
        updated_at?: string;
        expiresAt?: string;
        expires_at?: string;
        revoked?: boolean;
      }>;
    } | Array<{
      id: string;
      emailAddress?: string;
      email_address?: string;
      status: string;
      createdAt?: string;
      created_at?: string;
      updatedAt?: string;
      updated_at?: string;
      expiresAt?: string;
      expires_at?: string;
      revoked?: boolean;
    }>;
    const invitations = (Array.isArray(list) ? list : list?.data || [])
      .filter((inv) => !inv.revoked && inv.status !== 'accepted')
      .map((inv) => ({
        id: inv.id,
        emailAddress: inv.emailAddress || inv.email_address,
        status: inv.status,
        createdAt: inv.createdAt || inv.created_at,
        updatedAt: inv.updatedAt || inv.updated_at,
        expiresAt: inv.expiresAt || inv.expires_at,
        revoked: !!inv.revoked,
      }))

    return NextResponse.json({ invitations })
  } catch (error: unknown) {
    console.error('List invitations failed:', error)
    const err = error as { errors?: Array<{ message?: string }>; message?: string; status?: number };
    const message = err?.errors?.[0]?.message || err?.message || 'Failed to list invitations'
    return NextResponse.json({ error: message }, { status: err?.status || 500 })
  }
}

