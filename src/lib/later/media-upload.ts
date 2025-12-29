/**
 * Media upload utilities for Later API
 */

import { LaterMediaUploadError } from './errors'
import type { LaterMediaUpload, MediaUploadOptions } from './types'

/**
 * Detect media type from URL or file extension
 */
export function detectMediaType(
  urlOrFilename: string
): 'image' | 'video' | 'unknown' {
  const url = urlOrFilename.toLowerCase()

  // Image extensions
  const imageExts = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.heic', '.heif']
  if (imageExts.some((ext) => url.includes(ext))) {
    return 'image'
  }

  // Video extensions
  const videoExts = ['.mp4', '.mov', '.avi', '.webm', '.m4v', '.mkv']
  if (videoExts.some((ext) => url.includes(ext))) {
    return 'video'
  }

  // Check MIME type patterns in URL
  if (url.includes('image/')) {
    return 'image'
  }
  if (url.includes('video/')) {
    return 'video'
  }

  return 'unknown'
}

/**
 * Extract filename from URL
 */
export function extractFilename(url: string): string {
  try {
    const urlObj = new URL(url)
    const pathname = urlObj.pathname
    const filename = pathname.split('/').pop() || 'media'
    return filename
  } catch {
    // If URL parsing fails, try simple extraction
    const parts = url.split('/')
    return parts[parts.length - 1] || 'media'
  }
}

/**
 * Validate media URL format
 */
export function validateMediaUrl(url: string): boolean {
  try {
    const urlObj = new URL(url)
    return urlObj.protocol === 'http:' || urlObj.protocol === 'https:'
  } catch {
    return false
  }
}

/**
 * Validate media file size (in bytes)
 * Instagram limits: Images 8MB, Videos 100MB
 */
export function validateMediaSize(
  size: number,
  type: 'image' | 'video'
): boolean {
  const MAX_IMAGE_SIZE = 8 * 1024 * 1024 // 8MB
  const MAX_VIDEO_SIZE = 100 * 1024 * 1024 // 100MB

  if (type === 'image') {
    return size <= MAX_IMAGE_SIZE
  } else if (type === 'video') {
    return size <= MAX_VIDEO_SIZE
  }

  return false
}

/**
 * Fetch media from URL as Buffer
 */
export async function fetchMediaAsBuffer(url: string): Promise<Buffer> {
  try {
    if (!validateMediaUrl(url)) {
      throw new LaterMediaUploadError(
        `Invalid media URL: ${url}`,
        url
      )
    }

    const response = await fetch(url)

    if (!response.ok) {
      throw new LaterMediaUploadError(
        `Failed to fetch media from URL: ${response.status} ${response.statusText}`,
        url
      )
    }

    const arrayBuffer = await response.arrayBuffer()
    return Buffer.from(arrayBuffer)
  } catch (error) {
    if (error instanceof LaterMediaUploadError) {
      throw error
    }

    throw new LaterMediaUploadError(
      `Error fetching media from URL: ${url}`,
      url,
      error
    )
  }
}

/**
 * Get content type from URL or filename
 */
export function getContentType(urlOrFilename: string): string | undefined {
  const url = urlOrFilename.toLowerCase()

  // Image types
  if (url.endsWith('.jpg') || url.endsWith('.jpeg')) return 'image/jpeg'
  if (url.endsWith('.png')) return 'image/png'
  if (url.endsWith('.gif')) return 'image/gif'
  if (url.endsWith('.webp')) return 'image/webp'
  if (url.endsWith('.heic')) return 'image/heic'
  if (url.endsWith('.heif')) return 'image/heif'

  // Video types
  if (url.endsWith('.mp4')) return 'video/mp4'
  if (url.endsWith('.mov')) return 'video/quicktime'
  if (url.endsWith('.avi')) return 'video/x-msvideo'
  if (url.endsWith('.webm')) return 'video/webm'
  if (url.endsWith('.m4v')) return 'video/x-m4v'
  if (url.endsWith('.mkv')) return 'video/x-matroska'

  return undefined
}

/**
 * Prepare media upload options from URL
 */
export function prepareUploadOptions(url: string): MediaUploadOptions {
  const filename = extractFilename(url)
  const contentType = getContentType(url)

  return {
    filename,
    contentType,
  }
}

/**
 * Batch fetch multiple media URLs as Buffers
 * Fetches in parallel for better performance
 */
export async function fetchMultipleMedia(
  urls: string[]
): Promise<Array<{ url: string; buffer: Buffer; filename: string }>> {
  const results = await Promise.allSettled(
    urls.map(async (url) => {
      const buffer = await fetchMediaAsBuffer(url)
      const filename = extractFilename(url)
      return { url, buffer, filename }
    })
  )

  const successful: Array<{ url: string; buffer: Buffer; filename: string }> =
    []
  const failed: Array<{ url: string; error: unknown }> = []

  results.forEach((result, index) => {
    if (result.status === 'fulfilled') {
      successful.push(result.value)
    } else {
      failed.push({
        url: urls[index],
        error: result.reason,
      })
    }
  })

  if (failed.length > 0) {
    console.error('[Later Media Upload] Some media failed to fetch:', failed)
    // Optionally throw if you want strict validation
    // throw new LaterMediaUploadError(
    //   `Failed to fetch ${failed.length} media files`,
    //   failed[0].url,
    //   failed[0].error
    // )
  }

  return successful
}

/**
 * Format media upload for logging (sanitize buffer)
 */
export function formatMediaForLog(media: {
  url: string
  buffer?: Buffer
  filename?: string
}): Record<string, unknown> {
  return {
    url: media.url,
    filename: media.filename,
    bufferSize: media.buffer?.length,
    mediaType: detectMediaType(media.url),
  }
}

/**
 * Create FormData for media upload
 * Used by the Later API client
 */
export function createMediaFormData(
  buffer: Buffer,
  options: MediaUploadOptions
): FormData {
  const formData = new FormData()

  // Convert Buffer to Uint8Array for Blob compatibility
  const uint8Array = new Uint8Array(buffer)
  const blob = new Blob([uint8Array], {
    type: options.contentType || 'application/octet-stream',
  })

  formData.append('file', blob, options.filename || 'media')

  return formData
}

/**
 * Validate media upload response
 */
export function validateUploadResponse(
  response: unknown
): response is LaterMediaUpload {
  if (typeof response !== 'object' || response === null) {
    return false
  }

  const upload = response as Partial<LaterMediaUpload>

  return !!(
    upload.id &&
    upload.url &&
    (upload.type === 'image' || upload.type === 'video')
  )
}
