import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { db } from '@/lib/db'
import { getUserFromClerkId } from '@/lib/auth-utils'
import { hasProjectReadAccess } from '@/lib/projects/access'
import { put } from '@vercel/blob'
import { cropToInstagramFeed, getImageInfo } from '@/lib/images/auto-crop'
import { z } from 'zod'

export const runtime = 'nodejs'
export const maxDuration = 60
export const dynamic = 'force-dynamic'

const requestSchema = z.object({
  projectId: z.number(),
  imageIds: z.array(z.string()).min(1).max(10),
})

console.log('[AI Images Download Route] Module loaded at /api/ai-images-download')

export async function POST(req: NextRequest) {
  try {
    console.log('[AI Images Download] Starting download request')

    const { userId: clerkUserId, orgId } = await auth()
    if (!clerkUserId) {
      console.warn('[AI Images Download] Unauthorized request')
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const user = await getUserFromClerkId(clerkUserId)

    const body = await req.json()
    const { projectId, imageIds } = requestSchema.parse(body)

    console.log(`[AI Images Download] Processing ${imageIds.length} image(s) for project ${projectId}`)

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

    // Fetch AI images from database
    const aiImages = await db.aIGeneratedImage.findMany({
      where: {
        id: { in: imageIds },
        projectId: projectId,
      },
      select: {
        id: true,
        name: true,
        fileUrl: true,
      },
    })

    if (aiImages.length === 0) {
      return NextResponse.json({ error: 'No images found' }, { status: 404 })
    }

    console.log(`[AI Images Download] Found ${aiImages.length} images in database`)

    const uploadedFiles = []

    for (const aiImage of aiImages) {
      try {
        console.log(`[AI Images Download] Processing: ${aiImage.name}`)

        // Download image from URL
        const response = await fetch(aiImage.fileUrl)
        if (!response.ok) {
          throw new Error(`Failed to download image: ${response.statusText}`)
        }

        const arrayBuffer = await response.arrayBuffer()
        let buffer = Buffer.from(arrayBuffer)

        // Auto-crop images to Instagram feed format (1080x1350)
        try {
          const imageInfo = await getImageInfo(buffer)
          console.log(`📷 AI image: ${imageInfo.width}x${imageInfo.height} (${aiImage.name})`)

          const croppedBuffer = await cropToInstagramFeed(buffer)
          buffer = Buffer.from(croppedBuffer)
          console.log('✂️ Image cropped to 1080x1350')
        } catch (cropError) {
          console.warn('⚠️ Using original image (crop failed):', cropError)
          // Continue with original buffer if crop fails
        }

        // Upload to Vercel Blob
        const processedFileName = aiImage.name.replace(/\.[^/.]+$/, '.jpg')
        const blob = await put(
          `posts/${user.id}/ai-images/${Date.now()}-${processedFileName}`,
          buffer,
          {
            access: 'public',
            addRandomSuffix: true,
            contentType: 'image/jpeg',
          }
        )

        uploadedFiles.push({
          id: aiImage.id,
          url: blob.url,
          pathname: blob.pathname,
          name: aiImage.name,
        })

        console.log(`✅ Uploaded ${aiImage.name}`)
      } catch (error) {
        console.error(`Failed to process AI image ${aiImage.id}:`, error)
        // Continue with next image even if one fails
      }
    }

    console.log(`[AI Images Download] Successfully processed ${uploadedFiles.length}/${imageIds.length}`)

    return NextResponse.json({
      files: uploadedFiles,
      uploaded: uploadedFiles.length,
    })
  } catch (error) {
    console.error('[AI Images Download] Error:', error instanceof Error ? error.message : String(error))

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
