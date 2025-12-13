import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { handleUpload, type HandleUploadBody } from '@vercel/blob/client'

export const runtime = 'nodejs'

export async function POST(request: Request): Promise<NextResponse> {
  const { userId } = await auth()
  if (!userId) {
    console.warn('[Signed URL] Unauthorized request')
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = (await request.json()) as HandleUploadBody

    const jsonResponse = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (pathname) => {
        console.log('[Signed URL] Generating token for:', pathname)
        // Validate file type
        const filename = pathname.split('/').pop() || ''
        const isImage = /\.(jpg|jpeg|png|gif|webp)$/i.test(filename)
        const isVideo = /\.(mp4|mov|avi|webm)$/i.test(filename)
        const isFont = /\.(ttf|otf|woff|woff2)$/i.test(filename)

        if (!isImage && !isVideo && !isFont) {
          throw new Error('Only images, videos, and fonts are allowed')
        }

        // Determine allowed content types based on file type
        let allowedContentTypes: string[]
        if (isImage) {
          allowedContentTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp']
        } else if (isVideo) {
          allowedContentTypes = ['video/mp4', 'video/quicktime', 'video/x-msvideo', 'video/webm']
        } else {
          // Font files
          allowedContentTypes = [
            'font/ttf',
            'font/otf',
            'font/woff',
            'font/woff2',
            'application/x-font-ttf',
            'application/x-font-otf',
            'application/font-woff',
            'application/font-woff2',
            'application/octet-stream', // Some browsers send fonts as binary
          ]
        }

        // Generate token with user-specific path
        return {
          allowedContentTypes,
          tokenPayload: JSON.stringify({
            userId,
            uploadedAt: new Date().toISOString(),
          }),
          // Maximum file size: 100MB
          maximumSizeInBytes: 100 * 1024 * 1024,
        }
      },
      onUploadCompleted: async ({ blob, tokenPayload }) => {
        console.log('[Signed URL] Upload completed:', {
          url: blob.url,
          pathname: blob.pathname,
          tokenPayload,
        })
      },
    })

    return NextResponse.json(jsonResponse)
  } catch (error) {
    console.error('[Signed URL] Error:', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    })

    const errorMessage = error instanceof Error ? error.message : 'Failed to generate signed URL'
    return NextResponse.json(
      {
        error: 'Failed to generate signed URL',
        details: errorMessage
      },
      { status: 500 }
    )
  }
}
