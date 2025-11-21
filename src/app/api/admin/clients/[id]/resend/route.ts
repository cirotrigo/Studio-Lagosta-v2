import { NextResponse } from "next/server"
import { auth, createClerkClient } from "@clerk/nextjs/server"
import { ClientInviteStatus } from "../../../../../../../prisma/generated/client"
import { isAdmin } from "@/lib/admin-utils"
import { db } from "@/lib/db"
import { getClientInviteById } from "@/lib/services/client-invite-service"

const clerk = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY as string })

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params
    const { userId } = await auth()
    if (!userId || !(await isAdmin(userId))) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 })
    }

    const invite = await getClientInviteById(id)
    if (!invite) {
      return NextResponse.json({ error: "Convite não encontrado" }, { status: 404 })
    }

    if (
      invite.status !== ClientInviteStatus.PENDING &&
      invite.status !== ClientInviteStatus.EXPIRED
    ) {
      return NextResponse.json(
        { error: "Somente convites pendentes ou expirados podem ser reenviados" },
        { status: 400 }
      )
    }

    const invitation = await clerk.invitations.createInvitation({
      emailAddress: invite.email,
      redirectUrl: process.env.NEXT_PUBLIC_APP_URL
        ? `${process.env.NEXT_PUBLIC_APP_URL}/sign-up`
        : undefined,
      ignoreExisting: true,
    })

    await db.clientInvite.update({
      where: { id: invite.id },
      data: {
        clerkInvitationId: invitation.id,
        inviteUrl: invitation.url ?? null,
        status: ClientInviteStatus.PENDING,
        cancelledAt: null,
        expiresAt: null,
      },
    })

    return NextResponse.json({ status: "ok" })
  } catch (error) {
    console.error("Resend client invite error:", error)
    const message = error instanceof Error ? error.message : "Erro ao reenviar convite"
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
