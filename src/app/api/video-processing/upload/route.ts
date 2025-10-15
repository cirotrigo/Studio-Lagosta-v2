import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { handleUpload } from '@vercel/blob/client'

export const runtime = 'nodejs'

type AllowedUploadType = 'video' | 'thumbnail'

function getUploadSizeLimitBytes(type: AllowedUploadType) {
  if (type === 'thumbnail') {
    const fallbackMb = 10
    const overrideMb = Number(process.env.VIDEO_THUMBNAIL_MAX_MB || fallbackMb)
    const mb = Number.isFinite(overrideMb) && overrideMb > 0 ? overrideMb : fallbackMb
    return Math.max(1, mb) * 1024 * 1024
  }

  const fallbackMb = Number(process.env.BLOB_MAX_SIZE_MB || '200')
  const overrideMb = Number(process.env.VIDEO_UPLOAD_MAX_MB || fallbackMb)
  const mb = Number.isFinite(overrideMb) && overrideMb > 0 ? overrideMb : fallbackMb
  return Math.max(1, mb) * 1024 * 1024
}

function normalizePathname(pathname: string) {
  return pathname.replace(/^\/+/, '')
}

export async function POST(request: Request) {
  let body: unknown

  try {
    body = await request.clone().json()
  } catch (error) {
    console.error('[VideoUpload] Invalid JSON body:', error)
    return NextResponse.json({ error: 'Invalid upload request' }, { status: 400 })
  }

  if (!body || typeof body !== 'object' || !('type' in body)) {
    return NextResponse.json({ error: 'Unsupported upload event' }, { status: 400 })
  }

  const event = body as { type?: string }

  let clerkUserId: string | null = null
  if (event.type === 'blob.generate-client-token') {
    const authResult = await auth()
    clerkUserId = authResult.userId
    if (!clerkUserId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
  }

  try {
    const result = await handleUpload({
      request,
      body: event as Parameters<typeof handleUpload>[0]['body'],
      onBeforeGenerateToken: async (pathname, clientPayload, _multipart) => {
        if (!clerkUserId) {
          throw new Error('Unauthorized upload attempt')
        }

        const normalizedPath = normalizePathname(pathname)
        const videoPrefix = `video-processing/${clerkUserId}/`
        const thumbnailPrefix = `video-thumbnails/${clerkUserId}/`

        let uploadType: AllowedUploadType | null = null
        if (normalizedPath.startsWith(videoPrefix)) {
          uploadType = 'video'
        } else if (normalizedPath.startsWith(thumbnailPrefix)) {
          uploadType = 'thumbnail'
        }

        if (!uploadType) {
          console.warn('[VideoUpload] Upload path rejected:', {
            normalizedPath,
            expectedPrefixes: [videoPrefix, thumbnailPrefix],
            clerkUserId,
          })
          throw new Error('Invalid upload path')
        }

        const maximumSizeInBytes = getUploadSizeLimitBytes(uploadType)
        const allowedContentTypes =
          uploadType === 'thumbnail' ? ['image/jpeg', 'image/png'] : ['video/webm']

        return {
          allowedContentTypes,
          maximumSizeInBytes,
          tokenPayload: clientPayload,
        }
      },
      onUploadCompleted: async ({ blob }) => {
        console.log('[VideoUpload] Upload completed:', blob.pathname)
      },
    })

    return NextResponse.json(result)
  } catch (error) {
    console.error('[VideoUpload] Failed to handle upload event:', error)
    return NextResponse.json(
      { error: 'Failed to handle upload event' },
      { status: event.type === 'blob.generate-client-token' ? 400 : 500 }
    )
  }
}
