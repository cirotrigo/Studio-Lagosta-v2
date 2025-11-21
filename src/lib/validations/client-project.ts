import { z } from 'zod'
import { extractDriveFolderId } from './client-invite'

const optionalStringOrNull = () =>
  z.preprocess(
    (value) => {
      if (value == null) return null
      if (typeof value !== 'string') return value
      const trimmed = value.trim()
      return trimmed.length === 0 ? null : trimmed
    },
    z.string().nullable().optional()
  )

const optionalDriveIdOrNull = () =>
  z.preprocess(
    (value) => {
      if (value == null) return null
      if (typeof value !== 'string') return value
      const trimmed = value.trim()
      if (trimmed.length === 0) return null
      return extractDriveFolderId(trimmed)
    },
    z.string().nullable().optional()
  )

const zapierWebhookField = z.preprocess(
  (value) => {
    if (value == null) return null
    if (typeof value !== 'string') return value
    const trimmed = value.trim()
    return trimmed.length === 0 ? null : trimmed
  },
  z
    .string()
    .url('URL do webhook inválida')
    .refine(
      (val) => val.startsWith('https://hooks.zapier.com/'),
      'Webhook deve ser do Zapier'
    )
    .nullable()
    .optional()
)

export const updateClientProjectSchema = z.object({
  googleDriveFolderId: optionalDriveIdOrNull(),
  googleDriveFolderName: optionalStringOrNull(),
  googleDriveImagesFolderId: optionalDriveIdOrNull(),
  googleDriveImagesFolderName: optionalStringOrNull(),
  googleDriveVideosFolderId: optionalDriveIdOrNull(),
  googleDriveVideosFolderName: optionalStringOrNull(),
  instagramAccountId: optionalStringOrNull(),
  instagramUsername: optionalStringOrNull(),
  zapierWebhookUrl: zapierWebhookField,
})

export const clientProjectFiltersSchema = z.object({
  status: z.enum(['ACTIVE', 'INACTIVE', 'ARCHIVED']).optional(),
  clientEmail: optionalStringOrNull(),
})

export type UpdateClientProjectInput = z.infer<typeof updateClientProjectSchema>
export type ClientProjectFilters = z.infer<typeof clientProjectFiltersSchema>
