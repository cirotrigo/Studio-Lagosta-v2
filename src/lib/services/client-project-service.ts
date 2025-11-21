import type { Prisma, ProjectStatus } from '../../../prisma/generated/client'
import { db } from '@/lib/db'
import type {
  ClientProjectFilters,
  UpdateClientProjectInput,
} from '@/lib/validations/client-project'

export const clientProjectInclude = {
  clientInvite: {
    include: {
      user: {
        select: {
          id: true,
          email: true,
          name: true,
        },
      },
    },
  },
} satisfies Prisma.ProjectInclude

export type ClientProjectWithRelations = Prisma.ProjectGetPayload<{
  include: typeof clientProjectInclude
}>

export async function listClientProjects(filters: ClientProjectFilters = {}) {
  const where: Prisma.ProjectWhereInput = {
    isClientProject: true,
    clientInvite: filters.clientEmail
      ? {
          is: {
            email: {
              equals: filters.clientEmail.toLowerCase(),
              mode: 'insensitive',
            },
          },
        }
      : { isNot: null },
  }

  if (filters.status) {
    where.status = filters.status as ProjectStatus
  }

  return db.project.findMany({
    where,
    include: clientProjectInclude,
    orderBy: { updatedAt: 'desc' },
  })
}

export async function getClientProjectById(projectId: number) {
  return db.project.findFirst({
    where: {
      id: projectId,
      isClientProject: true,
    },
    include: clientProjectInclude,
  })
}

export async function updateClientProject(projectId: number, data: UpdateClientProjectInput) {
  const existing = await db.project.findFirst({
    where: { id: projectId, isClientProject: true },
    select: { id: true },
  })

  if (!existing) {
    return null
  }

  const updateData: Prisma.ProjectUpdateInput = {}

  if (data.googleDriveFolderId !== undefined) {
    updateData.googleDriveFolderId = data.googleDriveFolderId
  }
  if (data.googleDriveFolderName !== undefined) {
    updateData.googleDriveFolderName = data.googleDriveFolderName
  }
  if (data.googleDriveImagesFolderId !== undefined) {
    updateData.googleDriveImagesFolderId = data.googleDriveImagesFolderId
  }
  if (data.googleDriveImagesFolderName !== undefined) {
    updateData.googleDriveImagesFolderName = data.googleDriveImagesFolderName
  }
  if (data.googleDriveVideosFolderId !== undefined) {
    updateData.googleDriveVideosFolderId = data.googleDriveVideosFolderId
  }
  if (data.googleDriveVideosFolderName !== undefined) {
    updateData.googleDriveVideosFolderName = data.googleDriveVideosFolderName
  }
  if (data.instagramAccountId !== undefined) {
    updateData.instagramAccountId = data.instagramAccountId
  }
  if (data.instagramUsername !== undefined) {
    updateData.instagramUsername = data.instagramUsername
  }
  if (data.zapierWebhookUrl !== undefined) {
    updateData.zapierWebhookUrl = data.zapierWebhookUrl
  }

  return db.project.update({
    where: { id: projectId },
    data: updateData,
    include: clientProjectInclude,
  })
}
