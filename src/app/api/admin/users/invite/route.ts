import { auth, createClerkClient } from "@clerk/nextjs/server"
import { NextResponse } from "next/server"
import { z } from "zod"
import { isAdmin } from "@/lib/admin-utils"
import { db } from "@/lib/db"
import { getPlanCredits } from "@/lib/credits/settings"

const InviteSchema = z.object({
  email: z.string().email(),
  name: z.string().optional(),
})

const clerk = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY as string })

export const runtime = 'nodejs'

export async function POST(request: Request) {
  try {
    const { userId } = await auth()
    if (!userId || !(await isAdmin(userId))) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 })
    }

    const json = await request.json()
    const { email, name } = InviteSchema.parse(json)

    // Check if a Clerk user already exists for this email
    const existing = await clerk.users.getUserList({ emailAddress: [email] })
    if (existing?.data?.length) {
      const user = existing.data[0] as {
        id: string;
        emailAddresses?: Array<{ id: string; emailAddress: string }>;
        primaryEmailAddressId?: string;
        firstName?: string;
      }

      // Ensure local DB user and credit balance exist
      const existingDbUser = await db.user.findUnique({ where: { clerkId: user.id } })
      if (!existingDbUser) {
        const primary = user.emailAddresses?.find((e) => e.id === user.primaryEmailAddressId) || user.emailAddresses?.[0]
        const created = await db.user.create({
          data: {
            clerkId: user.id,
            email: primary?.emailAddress ?? email,
            name: name || user.firstName || null,
          },
        })
        await db.creditBalance.create({
          data: {
            userId: created.id,
            clerkUserId: user.id,
            creditsRemaining: await getPlanCredits('free'),
          },
        })
      }

      return NextResponse.json({ status: "exists", message: "Usuário já existe no Clerk", clerkUserId: user.id })
    }

    // Try to create an invitation for the user to join
    try {
      const invitation = await clerk.invitations.createInvitation({
        emailAddress: email,
        redirectUrl: process.env.NEXT_PUBLIC_APP_URL
          ? `${process.env.NEXT_PUBLIC_APP_URL}/sign-up`
          : undefined,
      })
      return NextResponse.json({ status: "invited", invitation })
    } catch (inviteErr: unknown) {
      console.error("Clerk invitation failed:", inviteErr)
      const err = inviteErr as { errors?: Array<{ message?: string }>; message?: string; status?: number };
      const message = err?.errors?.[0]?.message || err?.message || "Falha ao enviar convite"
      return NextResponse.json({ error: message }, { status: err?.status || 400 })
    }
  } catch (error) {
    console.error("Admin invite user error:", error)
    const err = error as { errors?: Array<{ message?: string }>; message?: string };
    const message = err?.errors?.[0]?.message || err?.message || "Requisição inválida"
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
