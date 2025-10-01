import { google, type drive_v3 } from 'googleapis'
import { OAuth2Client } from 'google-auth-library'
import { Readable } from 'stream'
import { randomUUID } from 'crypto'
import { setTimeout as sleep } from 'timers/promises'
import type {
  GoogleDriveItem,
  GoogleDriveListRequest,
  GoogleDriveListResponse,
  GoogleDriveUploadResult,
} from '@/types/google-drive'

const ARTES_FOLDER_NAME = 'ARTES LAGOSTA'
const MIME_TYPE_FOLDER = 'application/vnd.google-apps.folder'
const MIME_TYPE_IMAGE_PREFIX = 'image/'
const LIST_TIMEOUT = 30_000
const UPLOAD_TIMEOUT = 60_000
const CACHE_TTL_MS = 10 * 60 * 1000
const MAX_RETRIES = 3
const RETRY_BASE_DELAY_MS = 500

interface ArtesFolderCacheEntry {
  folderId: string
  expiresAt: number
}

function escapeQueryValue(value: string): string {
  return value.replace(/['\\]/g, (match) => `\\${match}`)
}

function sanitizeProjectName(name?: string | null) {
  if (!name) return 'creative'
  const trimmed = name.trim().toLowerCase()
  const slug = trimmed.replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '')
  return slug || 'creative'
}

function buildFileName(projectName?: string | null) {
  const timestamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\..+/, '')
  const safeName = sanitizeProjectName(projectName)
  const randomSuffix = randomUUID().slice(0, 8)
  return `${timestamp}_${safeName}_${randomSuffix}.png`
}

function ensureEnv(name: string): string | undefined {
  const value = process.env[name]
  if (!value || value.trim() === '') {
    return undefined
  }
  return value
}

function isRetryableError(error: unknown): boolean {
  const status = (error as { code?: number; response?: { status?: number } }).response?.status ??
    (error as { code?: number }).code

  if (typeof status === 'number') {
    return status === 429 || status === 500 || status === 502 || status === 503 || status === 504
  }
  return false
}

export class GoogleDriveService {
  private static instance: GoogleDriveService | null = null

  private readonly clientId = ensureEnv('GOOGLE_DRIVE_CLIENT_ID')
  private readonly clientSecret = ensureEnv('GOOGLE_DRIVE_CLIENT_SECRET')
  private readonly refreshToken = ensureEnv('GOOGLE_DRIVE_REFRESH_TOKEN')
  private readonly publicUrl = ensureEnv('PUBLIC_URL')

  private readonly enabled: boolean
  private readonly oauth2Client: OAuth2Client
  private readonly drive: drive_v3.Drive
  private readonly artesFolderCache = new Map<string, ArtesFolderCacheEntry>()

  private constructor() {
    this.enabled = Boolean(this.clientId && this.clientSecret && this.refreshToken)

    if (!this.enabled) {
      console.warn('[GoogleDriveService] Disabled — missing credentials')
    }

    this.oauth2Client = new google.auth.OAuth2(
      this.clientId,
      this.clientSecret,
      `${this.publicUrl ?? 'http://localhost:3000'}/google-drive-callback`,
    )

    if (this.refreshToken) {
      this.oauth2Client.setCredentials({ refresh_token: this.refreshToken })
    }

    this.drive = google.drive({ version: 'v3', auth: this.oauth2Client })
  }

  static getInstance(): GoogleDriveService {
    if (!this.instance) {
      this.instance = new GoogleDriveService()
    }
    return this.instance
  }

  isEnabled(): boolean {
    return this.enabled
  }

  async testConnection() {
    if (!this.enabled) {
      throw new Error('Google Drive integration not configured')
    }
    await this.withRetry('testConnection', async () => {
      await this.drive.files.list(
        {
          pageSize: 1,
          fields: 'files(id)',
          supportsAllDrives: false,
          q: "'root' in parents and trashed = false",
        },
        { timeout: LIST_TIMEOUT },
      )
    })
    return true
  }

  async listFiles({ folderId, search, pageToken, mode = 'folders' }: GoogleDriveListRequest): Promise<GoogleDriveListResponse> {
    this.ensureEnabled()

    const queryParts: string[] = []
    const targetFolder = folderId ? `'${escapeQueryValue(folderId)}' in parents` : "'root' in parents"
    queryParts.push(targetFolder)
    queryParts.push('trashed = false')

    if (mode === 'folders') {
      queryParts.push(`mimeType = '${MIME_TYPE_FOLDER}'`)
    } else if (mode === 'images') {
      queryParts.push(`(mimeType = '${MIME_TYPE_FOLDER}' or mimeType contains '${MIME_TYPE_IMAGE_PREFIX}')`)
    }

    if (search && search.trim().length > 0) {
      queryParts.push(`name contains '${escapeQueryValue(search.trim())}'`)
    }

    const response = await this.withRetry('listFiles', async () =>
      this.drive.files.list(
        {
          q: queryParts.join(' and '),
          orderBy: 'folder, name',
          pageSize: 50,
          pageToken,
          fields:
            'nextPageToken, files(id, name, mimeType, size, modifiedTime, iconLink, thumbnailLink, webViewLink, webContentLink)',
        },
        { timeout: LIST_TIMEOUT },
      ),
    )

    const files = response.data.files ?? []
    const items: GoogleDriveItem[] = files.map((file) => ({
      id: file.id!,
      name: file.name ?? 'Sem nome',
      mimeType: file.mimeType ?? 'application/octet-stream',
      kind: file.mimeType === MIME_TYPE_FOLDER ? 'folder' : 'file',
      size: file.size ? Number(file.size) : undefined,
      modifiedTime: file.modifiedTime ?? undefined,
      iconLink: file.iconLink ?? null,
      thumbnailLink: file.thumbnailLink ?? null,
      webViewLink: file.webViewLink ?? null,
      webContentLink: file.webContentLink ?? null,
    }))

    return {
      items,
      nextPageToken: response.data.nextPageToken ?? undefined,
    }
  }

  async uploadCreativeToArtesLagosta(buffer: Buffer, projectFolderId: string, projectName?: string | null): Promise<GoogleDriveUploadResult> {
    this.ensureEnabled()

    const artesFolderId = await this.ensureArtesLagostaFolder(projectFolderId)
    const fileName = buildFileName(projectName)

    const response = await this.withRetry('uploadCreativeToArtesLagosta', async () =>
      this.drive.files.create(
        {
          requestBody: {
            name: fileName,
            parents: [artesFolderId],
            mimeType: 'image/png',
          },
          media: {
            mimeType: 'image/png',
            body: Readable.from(buffer),
          },
          fields: 'id, webViewLink, webContentLink',
        },
        { timeout: UPLOAD_TIMEOUT },
      ),
    )

    const fileId = response.data.id
    if (!fileId) {
      throw new Error('Google Drive did not return a file ID after upload')
    }

    await this.makeFilePublic(fileId)
    const publicUrl = this.getPublicUrl(fileId)

    return {
      fileId,
      publicUrl,
      webViewLink: response.data.webViewLink ?? null,
      webContentLink: response.data.webContentLink ?? null,
    }
  }

  async getFileStream(fileId: string) {
    this.ensureEnabled()

    const metadata = await this.withRetry('getFileMetadata', async () =>
      this.drive.files.get(
        {
          fileId,
          fields: 'name, mimeType',
        },
        { timeout: 15_000 },
      ),
    )

    const mediaResponse = await this.withRetry('getFileStream', async () =>
      this.drive.files.get(
        {
          fileId,
          alt: 'media',
        },
        { responseType: 'stream', timeout: LIST_TIMEOUT },
      ),
    )

    const stream = mediaResponse.data as unknown as Readable

    return {
      stream,
      mimeType: metadata.data.mimeType ?? 'application/octet-stream',
      name: metadata.data.name ?? fileId,
    }
  }

  async makeFilePublic(fileId: string) {
    this.ensureEnabled()

    await this.withRetry('makeFilePublic', async () => {
      try {
        await this.drive.permissions.create(
          {
            fileId,
            requestBody: {
              role: 'reader',
              type: 'anyone',
            },
          },
          { timeout: 15_000 },
        )
      } catch (error) {
        const status = (error as { response?: { status?: number } }).response?.status
        if (status === 403 || status === 400) {
          console.warn('[GoogleDriveService] Permission may already exist for file', fileId)
          return
        }
        throw error
      }
    })
  }

  getPublicUrl(fileId: string) {
    return `https://drive.google.com/uc?export=view&id=${fileId}`
  }

  private async ensureArtesLagostaFolder(projectFolderId: string): Promise<string> {
    const cached = this.artesFolderCache.get(projectFolderId)
    const now = Date.now()
    if (cached && cached.expiresAt > now) {
      return cached.folderId
    }

    const existing = await this.findFolderByName(ARTES_FOLDER_NAME, projectFolderId)
    if (existing) {
      this.artesFolderCache.set(projectFolderId, {
        folderId: existing,
        expiresAt: now + CACHE_TTL_MS,
      })
      return existing
    }

    const created = await this.createFolder(ARTES_FOLDER_NAME, projectFolderId)
    this.artesFolderCache.set(projectFolderId, {
      folderId: created,
      expiresAt: now + CACHE_TTL_MS,
    })
    return created
  }

  private async findFolderByName(name: string, parentId: string): Promise<string | null> {
    const response = await this.withRetry('findFolderByName', async () =>
      this.drive.files.list(
        {
          q: `name = '${escapeQueryValue(name)}' and trashed = false and mimeType = '${MIME_TYPE_FOLDER}' and '${escapeQueryValue(parentId)}' in parents`,
          pageSize: 1,
          fields: 'files(id)',
        },
        { timeout: LIST_TIMEOUT },
      ),
    )

    const folder = response.data.files?.[0]
    return folder?.id ?? null
  }

  private async createFolder(name: string, parentId: string): Promise<string> {
    const response = await this.withRetry('createFolder', async () =>
      this.drive.files.create(
        {
          requestBody: {
            name,
            mimeType: MIME_TYPE_FOLDER,
            parents: [parentId],
          },
          fields: 'id',
        },
        { timeout: 15_000 },
      ),
    )

    const folderId = response.data.id
    if (!folderId) {
      throw new Error('Failed to create folder on Google Drive')
    }
    return folderId
  }

  private ensureEnabled() {
    if (!this.enabled) {
      throw new Error('Google Drive integration not configured')
    }
  }

  private async withRetry<T>(operation: string, fn: () => Promise<T>, attempt = 1): Promise<T> {
    try {
      return await fn()
    } catch (error) {
      if (attempt >= MAX_RETRIES || !isRetryableError(error)) {
        console.error(`[GoogleDriveService] ${operation} failed after ${attempt} attempts`, error)
        throw error
      }

      const delay = RETRY_BASE_DELAY_MS * 2 ** (attempt - 1)
      console.warn(`[GoogleDriveService] ${operation} retry ${attempt} in ${delay}ms`)
      await sleep(delay)
      return this.withRetry(operation, fn, attempt + 1)
    }
  }
}

export const googleDriveService = GoogleDriveService.getInstance()
