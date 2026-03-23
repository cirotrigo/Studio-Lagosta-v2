// Queue Item Status
export type QueueItemStatus = 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED' | 'CANCELLED'

// AI Image Models
export type AIImageModel = 'nano-banana-2' | 'nano-banana-pro'

// Aspect Ratios
export type AspectRatio = '1:1' | '16:9' | '9:16' | '4:5'

// Image Resolutions
export type ImageResolution = '1K' | '2K' | '4K'

// Reference Image Source
export type ReferenceImageSource = 'drive' | 'local' | 'generated' | 'recent'

// Pause Reasons
export type QueuePauseReason = 'manual' | 'offline' | 'no_credits' | 'rate_limit'

/**
 * Reference Image
 */
export interface ReferenceImage {
  id: string
  url: string
  thumbnailUrl: string
  source: ReferenceImageSource
  driveFileId?: string
  name?: string
  addedAt: string
}

/**
 * Queue Item Request
 */
export interface QueueItemRequest {
  prompt: string
  originalPrompt?: string
  improvedPrompt?: string
  model: AIImageModel
  aspectRatio: AspectRatio
  resolution: ImageResolution
  referenceImages: ReferenceImage[]
}

/**
 * Queue Item Result
 */
export interface QueueItemResult {
  imageId: string
  fileUrl: string
  thumbnailUrl: string
  creditsUsed: number
}

/**
 * Queue Item Error
 */
export interface QueueItemError {
  code: string
  message: string
  retryable: boolean
}

/**
 * Queue Item
 */
export interface QueueItem {
  id: string
  projectId?: number
  batchId?: string
  batchIndex?: number
  status: QueueItemStatus
  priority: number
  createdAt: string
  startedAt?: string
  completedAt?: string

  request: QueueItemRequest
  result?: QueueItemResult
  error?: QueueItemError

  attempts: number
  maxAttempts: number
  nextRetryAt?: string
}

/**
 * Queue Batch Progress
 */
export interface QueueBatchProgress {
  total: number
  completed: number
  failed: number
  processing: number
}

/**
 * Queue Batch
 */
export interface QueueBatch {
  id: string
  name: string
  originalPrompt: string
  itemIds: string[]
  createdAt: string
  progress: QueueBatchProgress
}

/**
 * Queue Stats
 */
export interface QueueStats {
  pending: number
  processing: number
  completed: number
  failed: number
  totalCreditsUsed: number
}

/**
 * Queue Settings
 */
export interface QueueSettings {
  autoRetry: boolean
  retryDelayMs: number
  persistQueue: boolean
  notifyOnComplete: boolean
  notifyOnBatchComplete: boolean
  maxConcurrency: number
  autoCleanCompletedAfterHours: number
}

/**
 * Queue State
 */
export interface QueueState {
  items: QueueItem[]
  batches: QueueBatch[]

  isProcessing: boolean
  isPaused: boolean
  pauseReason?: QueuePauseReason
  concurrency: number

  isDrawerOpen: boolean
  selectedItemId?: string

  stats: QueueStats
  settings: QueueSettings
  recentReferenceImages: ReferenceImage[]
}

/**
 * Drive File
 */
export interface DriveFile {
  id: string
  name: string
  mimeType: string
  kind: 'file' | 'folder'
  thumbnailLink?: string
  thumbnailUrl?: string
  webViewLink?: string
  size?: number
}

/**
 * Drive Folder Cache
 */
export interface DriveFolderCache {
  folderId: string
  files: DriveFile[]
  cachedAt: string
  expiresAt: string
}

/**
 * Drive Picker State
 */
export interface DrivePickerState {
  folderCache: Record<string, DriveFolderCache>
  lastVisitedFolderId?: string
  viewMode: 'grid' | 'list'
}

/**
 * Model Configuration
 */
export interface AIImageModelConfig {
  id: AIImageModel
  displayName: string
  description: string
  maxReferenceImages: number
  supportsResolution: boolean
  creditsBase: number
  creditsMultiplier: Record<ImageResolution, number>
}

/**
 * Model Configurations
 */
export const AI_IMAGE_MODEL_CONFIGS: Record<AIImageModel, AIImageModelConfig> = {
  'nano-banana-2': {
    id: 'nano-banana-2',
    displayName: 'Nano Banana 2',
    description: 'Rápido e econômico',
    maxReferenceImages: 14,
    supportsResolution: false,
    creditsBase: 2,
    creditsMultiplier: { '1K': 1, '2K': 1, '4K': 1 },
  },
  'nano-banana-pro': {
    id: 'nano-banana-pro',
    displayName: 'Nano Banana Pro',
    description: 'Melhor qualidade, mais detalhes',
    maxReferenceImages: 14,
    supportsResolution: true,
    creditsBase: 3,
    creditsMultiplier: { '1K': 1, '2K': 2, '4K': 3 },
  },
}

/**
 * Calculate credits for a model and resolution
 */
export function calculateCredits(model: AIImageModel, resolution: ImageResolution): number {
  const config = AI_IMAGE_MODEL_CONFIGS[model]
  return config.creditsBase * config.creditsMultiplier[resolution]
}

/**
 * Default Queue Settings
 */
export const DEFAULT_QUEUE_SETTINGS: QueueSettings = {
  autoRetry: true,
  retryDelayMs: 30000,
  persistQueue: true,
  notifyOnComplete: true,
  notifyOnBatchComplete: true,
  maxConcurrency: 2,
  autoCleanCompletedAfterHours: 24,
}

/**
 * Queue Constants
 */
export const QUEUE_CONSTANTS = {
  MAX_COMBINATIONS: 20,
  MAX_QUEUE_SIZE: 100,
  MAX_RETRY_ATTEMPTS: 3,
  RETRY_DELAYS_MS: [30000, 120000, 300000], // 30s, 2m, 5m
  CACHE_TTL_MS: 30 * 60 * 1000, // 30 minutes
}
