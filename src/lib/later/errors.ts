/**
 * Custom error classes for Later API integration
 */

import type { LaterErrorResponse, RateLimitInfo } from './types'

/**
 * Base error class for all Later API errors
 */
export class LaterApiError extends Error {
  public readonly statusCode: number
  public readonly response?: LaterErrorResponse
  public readonly timestamp: Date

  constructor(
    message: string,
    statusCode: number,
    response?: LaterErrorResponse
  ) {
    super(message)
    this.name = 'LaterApiError'
    this.statusCode = statusCode
    this.response = response
    this.timestamp = new Date()

    // Maintains proper stack trace for where error was thrown
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, LaterApiError)
    }
  }

  /**
   * Get error code from Later API response
   */
  get errorCode(): string | undefined {
    return this.response?.error?.code
  }

  /**
   * Get error details from Later API response
   */
  get errorDetails(): Record<string, unknown> | undefined {
    return this.response?.error?.details
  }

  /**
   * Convert error to JSON for logging
   */
  toJSON() {
    return {
      name: this.name,
      message: this.message,
      statusCode: this.statusCode,
      errorCode: this.errorCode,
      errorDetails: this.errorDetails,
      timestamp: this.timestamp.toISOString(),
    }
  }
}

/**
 * Rate limit exceeded error (HTTP 429)
 */
export class LaterRateLimitError extends LaterApiError {
  public readonly rateLimitInfo: RateLimitInfo

  constructor(rateLimitInfo: RateLimitInfo, response?: LaterErrorResponse) {
    const retryAfter = rateLimitInfo.retryAfter || 60
    const message = `Later API rate limit exceeded. Retry after ${retryAfter} seconds.`

    super(message, 429, response)
    this.name = 'LaterRateLimitError'
    this.rateLimitInfo = rateLimitInfo
  }

  /**
   * Get seconds until rate limit resets
   */
  get retryAfterSeconds(): number {
    return this.rateLimitInfo.retryAfter || 60
  }

  /**
   * Get timestamp when rate limit resets
   */
  get resetAt(): Date {
    return new Date(this.rateLimitInfo.reset * 1000)
  }

  toJSON() {
    return {
      ...super.toJSON(),
      rateLimitInfo: this.rateLimitInfo,
      retryAfterSeconds: this.retryAfterSeconds,
      resetAt: this.resetAt.toISOString(),
    }
  }
}

/**
 * Authentication error (HTTP 401)
 */
export class LaterAuthError extends LaterApiError {
  constructor(message = 'Authentication failed. Invalid or missing API key.') {
    super(message, 401)
    this.name = 'LaterAuthError'
  }
}

/**
 * Authorization error (HTTP 403)
 */
export class LaterAuthorizationError extends LaterApiError {
  constructor(message = 'Authorization failed. Insufficient permissions.') {
    super(message, 403)
    this.name = 'LaterAuthorizationError'
  }
}

/**
 * Resource not found error (HTTP 404)
 */
export class LaterNotFoundError extends LaterApiError {
  public readonly resourceType?: string
  public readonly resourceId?: string

  constructor(
    message = 'Resource not found.',
    resourceType?: string,
    resourceId?: string
  ) {
    super(message, 404)
    this.name = 'LaterNotFoundError'
    this.resourceType = resourceType
    this.resourceId = resourceId
  }

  toJSON() {
    return {
      ...super.toJSON(),
      resourceType: this.resourceType,
      resourceId: this.resourceId,
    }
  }
}

/**
 * Validation error (HTTP 422)
 */
export class LaterValidationError extends LaterApiError {
  public readonly validationErrors?: Record<string, string[]>

  constructor(
    message = 'Validation failed.',
    validationErrors?: Record<string, string[]>,
    response?: LaterErrorResponse
  ) {
    super(message, 422, response)
    this.name = 'LaterValidationError'
    this.validationErrors = validationErrors
  }

  toJSON() {
    return {
      ...super.toJSON(),
      validationErrors: this.validationErrors,
    }
  }
}

/**
 * Network or timeout error
 */
export class LaterNetworkError extends Error {
  public readonly originalError?: unknown

  constructor(message = 'Network error occurred.', originalError?: unknown) {
    super(message)
    this.name = 'LaterNetworkError'
    this.originalError = originalError

    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, LaterNetworkError)
    }
  }

  toJSON() {
    return {
      name: this.name,
      message: this.message,
      originalError: this.originalError,
    }
  }
}

/**
 * Media upload error
 */
export class LaterMediaUploadError extends Error {
  public readonly mediaUrl?: string
  public readonly originalError?: unknown

  constructor(
    message = 'Failed to upload media.',
    mediaUrl?: string,
    originalError?: unknown
  ) {
    super(message)
    this.name = 'LaterMediaUploadError'
    this.mediaUrl = mediaUrl
    this.originalError = originalError

    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, LaterMediaUploadError)
    }
  }

  toJSON() {
    return {
      name: this.name,
      message: this.message,
      mediaUrl: this.mediaUrl,
      originalError: this.originalError,
    }
  }
}

/**
 * Helper to determine if an error is a Later API error
 */
export function isLaterApiError(error: unknown): error is LaterApiError {
  return error instanceof LaterApiError
}

/**
 * Helper to determine if an error is a rate limit error
 */
export function isRateLimitError(
  error: unknown
): error is LaterRateLimitError {
  return error instanceof LaterRateLimitError
}

/**
 * Helper to extract error message from unknown error
 */
export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message
  }
  if (typeof error === 'string') {
    return error
  }
  return 'An unknown error occurred'
}

/**
 * Sanitize error for logging (remove sensitive data)
 */
export function sanitizeError(error: LaterApiError): Record<string, unknown> {
  const sanitized = error.toJSON()

  // Remove any potential sensitive data from response
  if (sanitized.errorDetails) {
    const details = { ...sanitized.errorDetails }
    // Add any sensitive field names here to exclude
    delete details.apiKey
    delete details.token
    sanitized.errorDetails = details
  }

  return sanitized
}
