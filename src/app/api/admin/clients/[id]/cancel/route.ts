import { NextResponse } from "next/server"
import { auth, createClerkClient } from "@clerk/nextjs/server"
import { ClientInviteStatus } from "../../../../../../../prisma/generated/client"
import { isAdmin } from "@/lib/admin-utils"
import {
  cancelClientInvite,
  getClientInviteById,
} from "@/lib/services/client-invite-service"

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

    if (invite.status !== ClientInviteStatus.PENDING) {
      return NextResponse.json(
        { error: "Apenas convites pendentes podem ser cancelados" },
        { status: 400 }
      )
    }

    if (invite.clerkInvitationId) {
      try {
        await clerk.invitations.revokeInvitation(invite.clerkInvitationId)
      } catch (revokeError) {
        console.warn("Falha ao revogar convite no Clerk:", revokeError)
      }
    }

    const cancelled = await cancelClientInvite(invite.id)
    return NextResponse.json(cancelled)
  } catch (error) {
    console.error("Cancel client invite error:", error)
    const message =
      error instanceof Error ? error.message : "Erro ao cancelar convite"
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
