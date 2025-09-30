import { v2 as cloudinary, UploadApiOptions, UploadApiResponse } from 'cloudinary'

const cloudName = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME
const apiKey = process.env.CLOUDINARY_API_KEY
const apiSecret = process.env.CLOUDINARY_API_SECRET

const cloudinaryConfigured = Boolean(cloudName && apiKey && apiSecret)

if (cloudinaryConfigured) {
  cloudinary.config({
    cloud_name: cloudName,
    api_key: apiKey,
    api_secret: apiSecret,
    secure: true,
  })
}

export function ensureCloudinaryConfigured(): void {
  if (!cloudinaryConfigured) {
    throw new Error('Cloudinary environment variables are missing')
  }
}

export interface CloudinaryUploadOptions {
  folder?: string
  resourceType?: UploadApiOptions['resource_type']
  tags?: string[]
  context?: UploadApiOptions['context']
}

export interface CloudinaryUploadResult {
  url: string
  secureUrl: string
  publicId: string
  bytes: number
  format?: string
  width?: number
  height?: number
}

export async function uploadToCloudinary(
  data: ArrayBuffer | Buffer,
  options: CloudinaryUploadOptions = {},
): Promise<CloudinaryUploadResult> {
  ensureCloudinaryConfigured()

  const buffer = Buffer.isBuffer(data) ? data : Buffer.from(data)

  return new Promise<CloudinaryUploadResult>((resolve, reject) => {
    const uploadOptions: UploadApiOptions = {
      folder: options.folder,
      resource_type: options.resourceType ?? 'auto',
      tags: options.tags,
      context: options.context,
    }

    const upload = cloudinary.uploader.upload_stream(uploadOptions, (error, result) => {
      if (error || !result) {
        reject(error ?? new Error('Cloudinary upload failed'))
        return
      }

      resolve({
        url: result.secure_url || result.url,
        secureUrl: result.secure_url || result.url,
        publicId: result.public_id,
        bytes: result.bytes,
        format: result.format ?? undefined,
        width: result.width ?? undefined,
        height: result.height ?? undefined,
      })
    })

    upload.end(buffer)
  })
}

export type CloudinaryClient = typeof cloudinary

export function getCloudinary(): CloudinaryClient {
  ensureCloudinaryConfigured()
  return cloudinary
}
