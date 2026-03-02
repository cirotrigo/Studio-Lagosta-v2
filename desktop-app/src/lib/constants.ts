// API Configuration
export const API_BASE_URL = 'https://studio-lagosta-v2.vercel.app'

// Post Types
export const POST_TYPES = {
  POST: 'POST',
  STORY: 'STORY',
  REEL: 'REEL',
  CAROUSEL: 'CAROUSEL',
} as const

export type PostType = keyof typeof POST_TYPES

// Post Type Labels (Portuguese)
export const POST_TYPE_LABELS: Record<PostType, string> = {
  POST: 'Feed',
  STORY: 'Story',
  REEL: 'Reel',
  CAROUSEL: 'Carrossel',
}

// Post Type Dimensions
export const POST_TYPE_DIMENSIONS: Record<PostType, { width: number; height: number }> = {
  POST: { width: 1080, height: 1350 },
  STORY: { width: 1080, height: 1920 },
  REEL: { width: 1080, height: 1920 },
  CAROUSEL: { width: 1080, height: 1350 },
}

// Schedule Types
export const SCHEDULE_TYPES = {
  IMMEDIATE: 'IMMEDIATE',
  SCHEDULED: 'SCHEDULED',
} as const

export type ScheduleType = keyof typeof SCHEDULE_TYPES

// Post Status
export const POST_STATUS = {
  DRAFT: 'DRAFT',
  SCHEDULED: 'SCHEDULED',
  POSTING: 'POSTING',
  POSTED: 'POSTED',
  FAILED: 'FAILED',
  CANCELLED: 'CANCELLED',
} as const

export type PostStatus = keyof typeof POST_STATUS

// Post Status Labels (Portuguese)
export const POST_STATUS_LABELS: Record<PostStatus, string> = {
  DRAFT: 'Rascunho',
  SCHEDULED: 'Agendado',
  POSTING: 'Publicando',
  POSTED: 'Publicado',
  FAILED: 'Falhou',
  CANCELLED: 'Cancelado',
}

// Post Status Colors
export const POST_STATUS_COLORS: Record<PostStatus, string> = {
  DRAFT: 'bg-text-subtle',
  SCHEDULED: 'bg-primary',
  POSTING: 'bg-warning',
  POSTED: 'bg-success',
  FAILED: 'bg-error',
  CANCELLED: 'bg-text-subtle',
}

// Caption Tones
export const CAPTION_TONES = {
  professional: 'Profissional',
  casual: 'Casual',
  fun: 'Divertido',
  inspirational: 'Inspiracional',
} as const

export type CaptionTone = keyof typeof CAPTION_TONES

// Max file size for uploads (20MB)
export const MAX_FILE_SIZE = 20 * 1024 * 1024

// Accepted image types
export const ACCEPTED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp']

// Max caption length
export const MAX_CAPTION_LENGTH = 2200

// Max images per carousel
export const MAX_CAROUSEL_IMAGES = 10

// IPC Channels
export const IPC_CHANNELS = {
  AUTH_GET_TOKEN: 'auth:get-token',
  AUTH_SAVE_TOKEN: 'auth:save-token',
  AUTH_CLEAR_TOKEN: 'auth:clear-token',
  IMAGE_PROCESS: 'image:process',
  APP_GET_VERSION: 'app:get-version',
  APP_OPEN_EXTERNAL: 'app:open-external',
} as const
