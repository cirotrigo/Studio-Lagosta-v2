import { NextResponse } from "next/server"
import { auth } from "@clerk/nextjs/server"
import { ClientInviteStatus } from "../../../../../../prisma/generated/client"
import { isAdmin } from "@/lib/admin-utils"
import {
  getClientInviteById,
  updateClientInviteRecord,
} from "@/lib/services/client-invite-service"
import { updateClientInviteSchema } from "@/lib/validations/client-invite"

export async function GET(
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

    return NextResponse.json(invite)
  } catch (error) {
    console.error("Get client invite error:", error)
    return NextResponse.json({ error: "Erro ao carregar convite" }, { status: 500 })
  }
}

export async function PATCH(
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
        { error: "Somente convites pendentes podem ser editados" },
        { status: 400 }
      )
    }

    const json = await request.json()
    const payload = updateClientInviteSchema.parse(json)

    if (payload.email && payload.email !== invite.email) {
      return NextResponse.json(
        { error: "Não é possível alterar o email do convite. Crie um novo convite." },
        { status: 400 }
      )
    }

    const updated = await updateClientInviteRecord(invite.id, payload)
    return NextResponse.json(updated)
  } catch (error) {
    console.error("Update client invite error:", error)
    const message = error instanceof Error ? error.message : "Erro ao atualizar convite"
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
