import type {
  ClientInviteStatus as PrismaClientInviteStatus,
  Prisma,
} from '../../../prisma/generated/client'
import {
  ClientInviteStatus,
} from '../../../prisma/generated/client'
import { db } from '@/lib/db'
import type {
  ClientInviteFilters,
  CreateClientInviteInput,
  UpdateClientInviteInput,
} from '@/lib/validations/client-invite'

const DEFAULT_CLIENT_TEMPLATE_ID = Number(process.env.DEFAULT_CLIENT_TEMPLATE_ID ?? '67')

async function cloneDefaultTemplateForProject(
  tx: Prisma.TransactionClient,
  options: { projectId: number; createdBy: string }
) {
  if (!Number.isInteger(DEFAULT_CLIENT_TEMPLATE_ID) || DEFAULT_CLIENT_TEMPLATE_ID <= 0) {
    return
  }

  const existingTemplates = await tx.template.count({
    where: { projectId: options.projectId },
  })
  if (existingTemplates > 0) {
    return
  }

  const baseTemplate = await tx.template.findUnique({
    where: { id: DEFAULT_CLIENT_TEMPLATE_ID },
    include: {
      Page: {
        orderBy: { order: 'asc' },
      },
    },
  })

  if (!baseTemplate) {
    console.warn(`[client-invite] Default template ${DEFAULT_CLIENT_TEMPLATE_ID} not found`)
    return
  }

  const newTemplate = await tx.template.create({
    data: {
      name: baseTemplate.name,
      type: baseTemplate.type,
      dimensions: baseTemplate.dimensions,
      designData: baseTemplate.designData,
      dynamicFields: baseTemplate.dynamicFields,
      thumbnailUrl: baseTemplate.thumbnailUrl,
      category: baseTemplate.category,
      tags: baseTemplate.tags,
      isPublic: false,
      isPremium: false,
      projectId: options.projectId,
      createdBy: options.createdBy,
    },
  })

  if (baseTemplate.Page?.length) {
    await Promise.all(
      baseTemplate.Page.map((page) =>
        tx.page.create({
          data: {
            name: page.name,
            width: page.width,
            height: page.height,
            layers: page.layers,
            background: page.background,
            order: page.order,
            thumbnail: page.thumbnail,
            templateId: newTemplate.id,
          },
        })
      )
    )
  }
}

export const clientInviteInclude = {
  user: {
    select: {
      id: true,
      email: true,
      name: true,
    },
  },
  project: {
    select: {
      id: true,
      name: true,
    },
  },
} satisfies Prisma.ClientInviteInclude

export type ClientInviteWithRelations = Prisma.ClientInviteGetPayload<{
  include: typeof clientInviteInclude
}>

function normalizeEmail(email: string) {
  return email.trim().toLowerCase()
}

export async function listClientInvites(filters: ClientInviteFilters = {}) {
  const where: Prisma.ClientInviteWhereInput = {}

  if (filters.status) {
    where.status = filters.status as PrismaClientInviteStatus
  }

  if (filters.email) {
    where.email = {
      equals: normalizeEmail(filters.email),
      mode: 'insensitive',
    }
  }

  return db.clientInvite.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    include: clientInviteInclude,
  })
}

export async function getClientInviteById(id: string) {
  return db.clientInvite.findUnique({
    where: { id },
    include: clientInviteInclude,
  })
}

export async function findPendingInviteByEmail(email: string) {
  return db.clientInvite.findFirst({
    where: {
      email: {
        equals: normalizeEmail(email),
        mode: 'insensitive',
      },
      status: ClientInviteStatus.PENDING,
    },
    orderBy: { createdAt: 'desc' },
  })
}

export interface CreateClientInviteRecordParams extends CreateClientInviteInput {
  invitedBy: string
  invitedByName?: string | null
  clerkInvitationId: string
  inviteUrl?: string | null
  expiresAt?: Date | null
}

export async function createClientInviteRecord(params: CreateClientInviteRecordParams) {
  return db.clientInvite.create({
    data: {
      email: normalizeEmail(params.email),
      clientName: params.clientName ?? null,
      projectName: params.projectName,
      projectDescription: params.projectDescription ?? null,
      googleDriveFolderId: params.googleDriveFolderId ?? null,
      googleDriveFolderName: params.googleDriveFolderName ?? null,
      googleDriveImagesFolderId: params.googleDriveImagesFolderId ?? null,
      googleDriveImagesFolderName: params.googleDriveImagesFolderName ?? null,
      googleDriveVideosFolderId: params.googleDriveVideosFolderId ?? null,
      googleDriveVideosFolderName: params.googleDriveVideosFolderName ?? null,
      instagramAccountId: params.instagramAccountId ?? null,
      instagramUsername: params.instagramUsername ?? null,
      zapierWebhookUrl: params.zapierWebhookUrl ?? null,
      clerkInvitationId: params.clerkInvitationId,
      inviteUrl: params.inviteUrl ?? null,
      invitedBy: params.invitedBy,
      invitedByName: params.invitedByName ?? null,
      expiresAt: params.expiresAt ?? null,
      status: ClientInviteStatus.PENDING,
    },
    include: clientInviteInclude,
  })
}

export async function updateClientInviteRecord(id: string, data: UpdateClientInviteInput) {
  const updateData: Prisma.ClientInviteUpdateInput = {}

  if (data.clientName !== undefined) {
    updateData.clientName = data.clientName
  }
  if (data.projectName !== undefined) {
    updateData.projectName = data.projectName
  }
  if (data.projectDescription !== undefined) {
    updateData.projectDescription = data.projectDescription ?? null
  }
  if (data.googleDriveFolderId !== undefined) {
    updateData.googleDriveFolderId = data.googleDriveFolderId ?? null
  }
  if (data.googleDriveFolderName !== undefined) {
    updateData.googleDriveFolderName = data.googleDriveFolderName ?? null
  }
  if (data.googleDriveImagesFolderId !== undefined) {
    updateData.googleDriveImagesFolderId = data.googleDriveImagesFolderId ?? null
  }
  if (data.googleDriveImagesFolderName !== undefined) {
    updateData.googleDriveImagesFolderName = data.googleDriveImagesFolderName ?? null
  }
  if (data.googleDriveVideosFolderId !== undefined) {
    updateData.googleDriveVideosFolderId = data.googleDriveVideosFolderId ?? null
  }
  if (data.googleDriveVideosFolderName !== undefined) {
    updateData.googleDriveVideosFolderName = data.googleDriveVideosFolderName ?? null
  }
  if (data.instagramAccountId !== undefined) {
    updateData.instagramAccountId = data.instagramAccountId ?? null
  }
  if (data.instagramUsername !== undefined) {
    updateData.instagramUsername = data.instagramUsername ?? null
  }
  if (data.zapierWebhookUrl !== undefined) {
    updateData.zapierWebhookUrl = data.zapierWebhookUrl ?? null
  }

  return db.clientInvite.update({
    where: { id },
    data: updateData,
    include: clientInviteInclude,
  })
}

export async function markInviteAccepted(inviteId: string, userId: string) {
  return db.clientInvite.update({
    where: { id: inviteId },
    data: {
      status: ClientInviteStatus.ACCEPTED,
      acceptedAt: new Date(),
      userId,
    },
  })
}

export async function markInviteCompleted(inviteId: string, projectId: number) {
  return db.clientInvite.update({
    where: { id: inviteId },
    data: {
      status: ClientInviteStatus.COMPLETED,
      completedAt: new Date(),
      projectId,
    },
  })
}

export async function cancelClientInvite(id: string) {
  return db.clientInvite.update({
    where: { id },
    data: {
      status: ClientInviteStatus.CANCELLED,
      cancelledAt: new Date(),
    },
    include: clientInviteInclude,
  })
}

export async function fulfillInviteForUser(params: {
  userId: string
  clerkUserId: string
  email: string | null
}) {
  if (!params.email) {
    return null
  }

  const normalizedEmail = params.email.toLowerCase()

  return db.$transaction(async (tx) => {
    const invite = await tx.clientInvite.findFirst({
      where: {
        email: {
          equals: normalizedEmail,
          mode: 'insensitive',
        },
        status: ClientInviteStatus.PENDING,
      },
      orderBy: { createdAt: 'desc' },
    })

    if (!invite) {
      return null
    }

    let projectId = invite.projectId

    if (!projectId) {
      const project = await tx.project.create({
        data: {
          name: invite.projectName,
          description: invite.projectDescription,
          userId: params.clerkUserId,
          status: 'ACTIVE',
          isClientProject: true,
          googleDriveFolderId: invite.googleDriveFolderId,
          googleDriveFolderName: invite.googleDriveFolderName,
          googleDriveImagesFolderId: invite.googleDriveImagesFolderId,
          googleDriveImagesFolderName: invite.googleDriveImagesFolderName,
          googleDriveVideosFolderId: invite.googleDriveVideosFolderId,
          googleDriveVideosFolderName: invite.googleDriveVideosFolderName,
          instagramAccountId: invite.instagramAccountId,
          instagramUsername: invite.instagramUsername,
          zapierWebhookUrl: invite.zapierWebhookUrl,
        },
      })
      projectId = project.id
    }

    if (projectId) {
      await cloneDefaultTemplateForProject(tx, {
        projectId,
        createdBy: params.clerkUserId,
      })
    }

    await tx.clientInvite.update({
      where: { id: invite.id },
      data: {
        status: ClientInviteStatus.COMPLETED,
        acceptedAt: invite.acceptedAt ?? new Date(),
        completedAt: new Date(),
        userId: params.userId,
        projectId,
      },
    })

    return { inviteId: invite.id, projectId }
  })
}
