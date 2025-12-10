import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { db } from '@/lib/db'
import { getUserFromClerkId } from '@/lib/auth-utils'
import { hasProjectReadAccess } from '@/lib/projects/access'
import { google } from 'googleapis'
import { put } from '@vercel/blob'
import { cropToInstagramFeed, getImageInfo } from '@/lib/images/auto-crop'
import { z } from 'zod'

export const runtime = 'nodejs'
export const maxDuration = 60
export const dynamic = 'force-dynamic'

const requestSchema = z.object({
  projectId: z.number(),
  fileIds: z.array(z.string()).min(1).max(10),
})

console.log('[GoogleDrive Download Route] Module loaded at /api/google-drive-download')

export async function POST(req: NextRequest) {
  try {
    console.log('[GoogleDrive Download] Starting download request')

    const { userId: clerkUserId, orgId } = await auth()
    if (!clerkUserId) {
      console.warn('[GoogleDrive Download] Unauthorized request')
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const user = await getUserFromClerkId(clerkUserId)

    const body = await req.json()
    const { projectId, fileIds } = requestSchema.parse(body)

    console.log(`[GoogleDrive Download] Processing ${fileIds.length} file(s) for project ${projectId}`)

    // Verify project access
    const project = await db.project.findUnique({
      where: { id: projectId },
      include: {
        organizationProjects: {
          include: {
            organization: {
              select: {
                clerkOrgId: true,
                name: true,
              },
            },
          },
        },
      },
    })

    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    }

    if (!hasProjectReadAccess(project, { userId: clerkUserId, orgId })) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 })
    }

    // Check if Google Drive credentials are configured
    if (!process.env.GOOGLE_DRIVE_CLIENT_ID || !process.env.GOOGLE_DRIVE_CLIENT_SECRET || !process.env.GOOGLE_DRIVE_REFRESH_TOKEN) {
      console.error('[GoogleDrive Download] Missing Google Drive credentials')
      return NextResponse.json(
        { error: 'Google Drive not configured' },
        { status: 503 }
      )
    }

    // Initialize Google Drive
    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_DRIVE_CLIENT_ID,
      process.env.GOOGLE_DRIVE_CLIENT_SECRET,
      `${process.env.PUBLIC_URL || 'http://localhost:3000'}/google-drive-callback`
    )

    const refreshToken = process.env.GOOGLE_DRIVE_REFRESH_TOKEN
    if (refreshToken) {
      oauth2Client.setCredentials({ refresh_token: refreshToken })
    }

    const drive = google.drive({ version: 'v3', auth: oauth2Client })
    const uploadedFiles = []

    for (const fileId of fileIds) {
      try {
        // Get metadata
        const metadata = await drive.files.get({
          fileId,
          fields: 'name, mimeType',
        })

        const fileName = metadata.data.name || 'download'

        // Download file
        const response = await drive.files.get(
          { fileId, alt: 'media' },
          { responseType: 'arraybuffer' }
        )

        let buffer = Buffer.from(response.data as any)
        const mimeType = metadata.data.mimeType || ''
        const isImage = mimeType.startsWith('image/')

        // Auto-crop images to Instagram feed format
        if (isImage) {
          try {
            const imageInfo = await getImageInfo(buffer)
            console.log(`📷 Google Drive image: ${imageInfo.width}x${imageInfo.height}`)
            buffer = await cropToInstagramFeed(buffer)
            console.log('✂️ Image cropped to 1080x1350')
          } catch (_cropError) {
            console.warn('⚠️ Using original image (crop failed)')
          }
        }

        // Upload to Vercel Blob
        const processedFileName = isImage ? fileName.replace(/\.[^/.]+$/, '.jpg') : fileName
        const blob = await put(
          `posts/${user.id}/google-drive/${Date.now()}-${processedFileName}`,
          buffer,
          {
            access: 'public',
            addRandomSuffix: true,
            contentType: isImage ? 'image/jpeg' : mimeType,
          }
        )

        uploadedFiles.push({
          id: fileId,
          url: blob.url,
          pathname: blob.pathname,
          name: fileName,
        })

        console.log(`✅ Uploaded ${fileName}`)
      } catch (error) {
        console.error(`Failed to process file ${fileId}:`, error)
      }
    }

    console.log(`[GoogleDrive Download] Successfully processed ${uploadedFiles.length}/${fileIds.length}`)

    return NextResponse.json({
      files: uploadedFiles,
      uploaded: uploadedFiles.length,
    })
  } catch (error) {
    console.error('[GoogleDrive Download] Error:', error instanceof Error ? error.message : String(error))

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Validation error', details: error.errors },
        { status: 400 }
      )
    }

    return NextResponse.json(
      { error: 'Download failed', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
