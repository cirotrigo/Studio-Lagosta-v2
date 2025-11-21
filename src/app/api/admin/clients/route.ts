import { NextResponse } from "next/server"
import { auth, createClerkClient } from "@clerk/nextjs/server"
import { ClientInviteStatus } from "../../../../../prisma/generated/client"
import { isAdmin } from "@/lib/admin-utils"
import { db } from "@/lib/db"
import {
  listClientInvites,
  createClientInviteRecord,
} from "@/lib/services/client-invite-service"
import {
  clientInviteFiltersSchema,
  createClientInviteSchema,
} from "@/lib/validations/client-invite"

const clerk = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY as string })

function parseInviteFilters(request: Request) {
  const url = new URL(request.url)
  return clientInviteFiltersSchema.parse({
    status: url.searchParams.get("status") ?? undefined,
    email: url.searchParams.get("email") ?? undefined,
  })
}

export async function GET(request: Request) {
  try {
    const { userId } = await auth()
    if (!userId || !(await isAdmin(userId))) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 })
    }

    const filters = parseInviteFilters(request)
    const invites = await listClientInvites(filters)
    return NextResponse.json(invites)
  } catch (error) {
    console.error("List client invites error:", error)
    return NextResponse.json({ error: "Erro ao listar convites" }, { status: 500 })
  }
}

async function assertEmailAvailable(email: string) {
  const existingUser = await db.user.findFirst({
    where: {
      email: {
        equals: email,
        mode: "insensitive",
      },
    },
    select: { id: true },
  })

  if (existingUser) {
    throw new Error("Este email já possui uma conta ativa")
  }

  const existingInvite = await db.clientInvite.findFirst({
    where: {
      email: {
        equals: email,
        mode: "insensitive",
      },
      status: {
        in: [ClientInviteStatus.PENDING, ClientInviteStatus.ACCEPTED],
      },
    },
    select: { id: true, status: true },
  })

  if (existingInvite) {
    throw new Error("Já existe um convite ativo para este email")
  }

  const clerkUsers = await clerk.users.getUserList({ emailAddress: [email] })
  if (clerkUsers?.data?.length) {
    throw new Error("Este email já está registrado no Clerk")
  }
}

function getInvitationUrl(invitation: { url?: string }) {
  return invitation?.url ?? null
}

export async function POST(request: Request) {
  try {
    const { userId } = await auth()
    if (!userId || !(await isAdmin(userId))) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 })
    }

    const json = await request.json()
    const payload = createClientInviteSchema.parse(json)
    await assertEmailAvailable(payload.email)

    const invitation = await clerk.invitations.createInvitation({
      emailAddress: payload.email,
      redirectUrl: process.env.NEXT_PUBLIC_APP_URL
        ? `${process.env.NEXT_PUBLIC_APP_URL}/sign-up`
        : undefined,
      ignoreExisting: true,
    })

    const adminProfile = await db.user.findUnique({
      where: { clerkId: userId },
      select: { name: true, email: true },
    })

    const inviteRecord = await createClientInviteRecord({
      ...payload,
      clerkInvitationId: invitation.id,
      inviteUrl: getInvitationUrl(invitation),
      invitedBy: userId,
      invitedByName: adminProfile?.name ?? adminProfile?.email ?? null,
    })

    return NextResponse.json(inviteRecord, { status: 201 })
  } catch (error) {
    console.error("Create client invite error:", error)
    const message =
      error instanceof Error ? error.message : "Erro ao criar convite"
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
