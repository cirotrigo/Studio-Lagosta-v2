/**
 * Later API Integration
 * Main entry point for all Later-related modules
 */

// Export client
export { LaterClient, getLaterClient, resetLaterClient } from './client'

// Export types
export type {
  LaterAccount,
  LaterMediaUpload,
  LaterPost,
  LaterPostStatus,
  InstagramContentType,
  InstagramPlatformData,
  PlatformSpecificData,
  CreateLaterPostPayload,
  UpdateLaterPostPayload,
  LaterListResponse,
  LaterErrorResponse,
  LaterWebhookEventType,
  LaterWebhookPayload,
  MediaUploadOptions,
  RateLimitInfo,
  LaterClientConfig,
} from './types'

// Export errors
export {
  LaterApiError,
  LaterRateLimitError,
  LaterAuthError,
  LaterAuthorizationError,
  LaterNotFoundError,
  LaterValidationError,
  LaterNetworkError,
  LaterMediaUploadError,
  isLaterApiError,
  isRateLimitError,
  getErrorMessage,
  sanitizeError,
} from './errors'

// Export media utilities
export {
  detectMediaType,
  extractFilename,
  validateMediaUrl,
  validateMediaSize,
  fetchMediaAsBuffer,
  getContentType,
  prepareUploadOptions,
  fetchMultipleMedia,
  formatMediaForLog,
  createMediaFormData,
  validateUploadResponse,
} from './media-upload'
