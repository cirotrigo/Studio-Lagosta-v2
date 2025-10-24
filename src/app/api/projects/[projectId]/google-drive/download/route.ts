import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { db } from '@/lib/db'
import { getUserFromClerkId } from '@/lib/auth-utils'
import { hasProjectReadAccess } from '@/lib/projects/access'
import { google } from 'googleapis'
import { put } from '@vercel/blob'
import { cropToInstagramFeed, getImageInfo } from '@/lib/images/auto-crop'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId: projectIdParam } = await params

  try {
    const { userId: clerkUserId, orgId } = await auth()
    if (!clerkUserId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const user = await getUserFromClerkId(clerkUserId)
    const projectId = parseInt(projectIdParam)

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

    const { fileIds } = await req.json()

    if (!fileIds || !Array.isArray(fileIds)) {
      return NextResponse.json(
        { error: 'fileIds array required' },
        { status: 400 }
      )
    }

    // Initialize Google Drive with service account or global credentials
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

        let buffer = Buffer.from(response.data as ArrayBuffer)
        const mimeType = metadata.data.mimeType || ''
        const isImage = mimeType.startsWith('image/')

        // Auto-crop images to Instagram feed format (4:5 - 1080x1350)
        if (isImage) {
          try {
            const imageInfo = await getImageInfo(buffer)
            console.log(`📷 Google Drive image: ${imageInfo.width}x${imageInfo.height} (ratio: ${imageInfo.ratio.toFixed(2)})`)

            // Crop to 4:5 ratio for feed posts
            buffer = await cropToInstagramFeed(buffer)
            console.log('✂️ Image cropped to 1080x1350 (4:5 ratio)')
          } catch (cropError) {
            console.error('Crop error:', cropError)
            // Continue with original buffer if crop fails
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
      } catch (error) {
        console.error(`Failed to process file ${fileId}:`, error)
      }
    }

    return NextResponse.json({
      files: uploadedFiles,
      uploaded: uploadedFiles.length,
    })
  } catch (error) {
    console.error('[GOOGLE_DRIVE_DOWNLOAD]', error)
    return NextResponse.json(
      { error: 'Download failed' },
      { status: 500 }
    )
  }
}
