import { z } from 'zod'

const optionalTrimmedString = () =>
  z.preprocess(
    (value) => {
      if (value == null) return null
      if (typeof value !== 'string') return value
      const trimmed = value.trim()
      return trimmed.length === 0 ? null : trimmed
    },
    z.string().nullable().optional()
  )

const optionalDriveFolderId = () =>
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

const zapierWebhookSchema = z.preprocess(
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

export const clientInviteStatusSchema = z.enum([
  'PENDING',
  'ACCEPTED',
  'COMPLETED',
  'CANCELLED',
  'EXPIRED',
])

export const createClientInviteSchema = z.object({
  email: z
    .string()
    .email('Email inválido')
    .min(1, 'Email é obrigatório')
    .transform((val) => val.trim().toLowerCase()),
  clientName: optionalTrimmedString(),
  projectName: z
    .string()
    .min(1, 'Nome do projeto é obrigatório')
    .max(150, 'Nome do projeto muito longo')
    .transform((val) => val.trim()),
  projectDescription: optionalTrimmedString(),
  googleDriveFolderId: optionalDriveFolderId(),
  googleDriveFolderName: optionalTrimmedString(),
  googleDriveImagesFolderId: optionalDriveFolderId(),
  googleDriveImagesFolderName: optionalTrimmedString(),
  googleDriveVideosFolderId: optionalDriveFolderId(),
  googleDriveVideosFolderName: optionalTrimmedString(),
  instagramAccountId: optionalTrimmedString(),
  instagramUsername: optionalTrimmedString(),
  zapierWebhookUrl: zapierWebhookSchema,
})

export const updateClientInviteSchema = createClientInviteSchema
  .extend({
    email: createClientInviteSchema.shape.email.optional(),
  })
  .partial()

export const clientInviteFiltersSchema = z.object({
  status: clientInviteStatusSchema.optional(),
  email: optionalTrimmedString(),
})

export type CreateClientInviteInput = z.infer<typeof createClientInviteSchema>
export type UpdateClientInviteInput = z.infer<typeof updateClientInviteSchema>
export type ClientInviteFilters = z.infer<typeof clientInviteFiltersSchema>
export type ClientInviteStatus = z.infer<typeof clientInviteStatusSchema>

export function extractDriveFolderId(value: string) {
  const trimmed = value.trim()
  const urlMatch = trimmed.match(/\/folders\/([a-zA-Z0-9_-]+)/)
  return urlMatch ? urlMatch[1] : trimmed
}
