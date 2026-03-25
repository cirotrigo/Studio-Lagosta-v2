/**
 * Studio Lagosta MCP Server
 *
 * Provides Claude with structured tools to manage Instagram Story posts,
 * templates, images (Google Drive), knowledge base, and weekly planning.
 *
 * Run: npx tsx scripts/mcp-server.ts
 */

import 'dotenv/config'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { z } from 'zod'
import { google } from 'googleapis'
import { PrismaClient } from '../prisma/generated/client'
import { put } from '@vercel/blob'
import * as fs from 'fs'
import * as path from 'path'
import * as https from 'https'
import * as http from 'http'

// ─── Clients ─────────────────────────────────────────────────────────

const prisma = new PrismaClient()

function getOAuth2Client() {
  const client = new google.auth.OAuth2(
    process.env.GOOGLE_DRIVE_CLIENT_ID,
    process.env.GOOGLE_DRIVE_CLIENT_SECRET,
  )
  client.setCredentials({ refresh_token: process.env.GOOGLE_DRIVE_REFRESH_TOKEN })
  return client
}

function getDrive() {
  return google.drive({ version: 'v3', auth: getOAuth2Client() })
}

// ─── BRT Timezone Helpers ────────────────────────────────────────────

/** Parse BRT datetime string "YYYY-MM-DD HH:mm" → UTC Date (adds 3h) */
function parseBRT(input: string): Date {
  // Already ISO with timezone
  if (input.includes('T') && (input.endsWith('Z') || input.includes('+'))) {
    return new Date(input)
  }
  // "YYYY-MM-DD HH:mm" assumed BRT (UTC-3)
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(input)) {
    const utc = new Date(input.replace(' ', 'T') + ':00.000Z')
    utc.setHours(utc.getHours() + 3) // BRT → UTC
    return utc
  }
  // "YYYY-MM-DDTHH:mm" without timezone, assume BRT
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(input)) {
    const utc = new Date(input + ':00.000Z')
    utc.setHours(utc.getHours() + 3)
    return utc
  }
  return new Date(input)
}

/** Format UTC Date → BRT string "YYYY-MM-DD HH:mm" */
function formatBRT(date: Date): string {
  const brt = new Date(date.getTime() - 3 * 60 * 60 * 1000)
  return brt.toISOString().slice(0, 16).replace('T', ' ')
}

function formatDate(date: Date): string {
  return date.toISOString().split('T')[0]
}

// ─── Image Catalog Helpers ───────────────────────────────────────────

interface ImageCatalogEntry {
  driveFileId: string
  fileName: string
  folder: string
  folderId: string
  createdTime?: string
  menuItem?: string | null
  menuCategory?: string | null
  description?: string
  tags?: string[]
  mood?: string
  bestFor?: string[]
  quality: string
  usageHistory: { date: string; theme: string }[]
}

interface ImageCatalog {
  projectId: number
  projectName: string
  catalogFileId?: string | null
  lastUpdated: string
  images: ImageCatalogEntry[]
}

async function loadCatalog(imagesFolderId: string): Promise<ImageCatalog | null> {
  const drive = getDrive()
  const res = await drive.files.list({
    q: `'${imagesFolderId}' in parents and name = '_image-catalog.json' and trashed = false`,
    fields: 'files(id)',
    pageSize: 1,
  })
  const fileId = res.data.files?.[0]?.id
  if (!fileId) return null

  const content = await drive.files.get({ fileId, alt: 'media' }, { responseType: 'json' })
  const catalog = content.data as unknown as ImageCatalog
  catalog.catalogFileId = fileId
  return catalog
}

function selectImage(
  catalog: ImageCatalog,
  theme: string,
  targetDate: string,
  alreadySelected: Set<string>,
): ImageCatalogEntry | null {
  const notSelected = (img: ImageCatalogEntry) => !alreadySelected.has(img.driveFileId)
  const highQuality = (img: ImageCatalogEntry) => img.quality !== 'baixa'

  // 1. bestFor match
  let candidates = catalog.images.filter(
    (img) => notSelected(img) && highQuality(img)
      && img.bestFor?.some((b) => b.toLowerCase().includes(theme.toLowerCase())),
  )

  // 2. tags match
  if (!candidates.length) {
    candidates = catalog.images.filter(
      (img) => notSelected(img) && highQuality(img)
        && img.tags?.some((t) => t.toLowerCase().includes(theme.toLowerCase())),
    )
  }

  // 3. menuCategory match
  if (!candidates.length) {
    const categoryMap: Record<string, string[]> = {
      abertura: ['AMBIENTE', 'AREA_KIDS'],
      almoco: ['PRATOS_PRINCIPAIS', 'PRATOS_BY_ROCK'],
      'happy-hour': ['BEBIDAS', 'PETISCOS_ENTRADAS'],
    }
    const categories = categoryMap[theme] ?? []
    if (categories.length) {
      candidates = catalog.images.filter(
        (img) => notSelected(img) && highQuality(img)
          && img.menuCategory && categories.includes(img.menuCategory),
      )
    }
  }

  // 4. Fallback: any unused
  if (!candidates.length) {
    candidates = catalog.images.filter(notSelected)
  }

  if (!candidates.length) return null

  // Sort by least recently used
  candidates.sort((a, b) => {
    const aLast = a.usageHistory?.length ? a.usageHistory[a.usageHistory.length - 1].date : '2000-01-01'
    const bLast = b.usageHistory?.length ? b.usageHistory[b.usageHistory.length - 1].date : '2000-01-01'
    return aLast.localeCompare(bLast)
  })

  return candidates[0]
}

// ─── Knowledge Base Helper ───────────────────────────────────────────

async function loadKB(projectId: number) {
  const entries = await prisma.$queryRawUnsafe<{ category: string; title: string; content: string }[]>(
    `SELECT category, title, content FROM knowledge_base_entries WHERE "projectId" = $1 AND status = 'ACTIVE'`,
    projectId,
  )
  return entries
}

// ─── HTTP fetch helper (for fonts/images) ────────────────────────────

function fetchBuffer(url: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : http
    client.get(url, (res) => {
      if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return fetchBuffer(res.headers.location).then(resolve).catch(reject)
      }
      const chunks: Buffer[] = []
      res.on('data', (c: Buffer) => chunks.push(c))
      res.on('end', () => resolve(Buffer.concat(chunks)))
      res.on('error', reject)
    }).on('error', reject)
  })
}

// ─── Week Planner Helpers ────────────────────────────────────────────

const DAY_NAMES = ['domingo', 'segunda', 'terca', 'quarta', 'quinta', 'sexta', 'sabado']
const DAY_TITLES: Record<string, string> = {
  domingo: 'DOMINGO', segunda: 'SEGUNDA', terca: 'TERÇA',
  quarta: 'QUARTA', quinta: 'QUINTA', sexta: 'SEXTA', sabado: 'SÁBADO',
}

function getWeekStart(weekStr: string): Date {
  if (weekStr === 'next') {
    const today = new Date()
    const day = today.getDay()
    const daysUntilMonday = day === 0 ? 1 : 8 - day
    const monday = new Date(today)
    monday.setDate(today.getDate() + daysUntilMonday)
    return monday
  }
  return new Date(weekStr + 'T12:00:00')
}

async function getTemplatePages(projectId: number) {
  const templates = await prisma.template.findMany({
    where: { projectId, type: 'STORY' },
    include: {
      Page: {
        where: { isTemplate: true },
        select: { id: true, name: true, templateId: true },
      },
    },
  })

  const allPages = templates.flatMap((t: any) =>
    t.Page.map((p: any) => ({ ...p, templateName: t.name, templateId: t.id })),
  )

  return { templates, pages: allPages }
}

// ─── MCP Server Setup ────────────────────────────────────────────────

const server = new McpServer({
  name: 'studio-lagosta',
  version: '1.0.0',
})

// ═══════════════════════════════════════════════════════════════════════
// TOOL 1: list-projects
// ═══════════════════════════════════════════════════════════════════════

server.tool(
  'list-projects',
  'List active projects with Drive folders and Instagram config',
  {
    status: z.enum(['ACTIVE', 'INACTIVE', 'ARCHIVED']).optional().describe('Filter by status (default: ACTIVE)'),
  },
  async ({ status }) => {
    try {
      const projects = await prisma.project.findMany({
        where: { status: status ?? 'ACTIVE' },
        select: {
          id: true,
          name: true,
          status: true,
          googleDriveFolderId: true,
          googleDriveImagesFolderId: true,
          instagramUsername: true,
          instagramAccountId: true,
          postingProvider: true,
          zapierWebhookUrl: true,
          userId: true,
        },
        orderBy: { name: 'asc' },
      })

      return {
        content: [{ type: 'text' as const, text: JSON.stringify(projects, null, 2) }],
      }
    } catch (error: any) {
      return { content: [{ type: 'text' as const, text: `Error: ${error.message}` }], isError: true }
    }
  },
)

// ═══════════════════════════════════════════════════════════════════════
// TOOL 2: list-templates
// ═══════════════════════════════════════════════════════════════════════

server.tool(
  'list-templates',
  'List templates for a project with page summaries',
  {
    projectId: z.number().describe('Project ID'),
    type: z.enum(['STORY', 'FEED', 'SQUARE']).optional().describe('Template type filter'),
  },
  async ({ projectId, type }) => {
    try {
      const where: any = { projectId }
      if (type) where.type = type

      const templates = await prisma.template.findMany({
        where,
        include: {
          Page: {
            select: { id: true, name: true, isTemplate: true, thumbnail: true, tags: true },
            orderBy: { order: 'asc' },
          },
        },
        orderBy: { name: 'asc' },
      })

      const result = templates.map((t: any) => ({
        id: t.id,
        name: t.name,
        type: t.type,
        thumbnailUrl: t.thumbnailUrl,
        pageCount: t.Page.length,
        pages: t.Page.map((p: any) => ({
          id: p.id,
          name: p.name,
          isTemplate: p.isTemplate,
          tags: p.tags,
        })),
      }))

      return {
        content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
      }
    } catch (error: any) {
      return { content: [{ type: 'text' as const, text: `Error: ${error.message}` }], isError: true }
    }
  },
)

// ═══════════════════════════════════════════════════════════════════════
// TOOL 3: get-template-pages
// ═══════════════════════════════════════════════════════════════════════

server.tool(
  'get-template-pages',
  'Get all pages of a template with optional layer details',
  {
    templateId: z.number().describe('Template ID'),
    includeLayerDetails: z.boolean().optional().describe('Include full layer JSON (default: false)'),
  },
  async ({ templateId, includeLayerDetails }) => {
    try {
      const pages = await prisma.page.findMany({
        where: { templateId },
        orderBy: { order: 'asc' },
      })

      const result = pages.map((p: any) => {
        const layers = Array.isArray(p.layers) ? p.layers : (typeof p.layers === 'string' ? JSON.parse(p.layers) : [])
        return {
          id: p.id,
          name: p.name,
          width: p.width,
          height: p.height,
          background: p.background,
          isTemplate: p.isTemplate,
          tags: p.tags,
          order: p.order,
          thumbnail: p.thumbnail,
          layerCount: layers.length,
          ...(includeLayerDetails
            ? { layers }
            : { layerNames: layers.map((l: any) => ({ id: l.id, name: l.name, type: l.type, isDynamic: l.isDynamic })) }
          ),
        }
      })

      return {
        content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
      }
    } catch (error: any) {
      return { content: [{ type: 'text' as const, text: `Error: ${error.message}` }], isError: true }
    }
  },
)

// ═══════════════════════════════════════════════════════════════════════
// TOOL 4: create-page
// ═══════════════════════════════════════════════════════════════════════

server.tool(
  'create-page',
  'Create a new page in a template',
  {
    templateId: z.number().describe('Template ID'),
    name: z.string().describe('Page name'),
    width: z.number().optional().describe('Canvas width (default: 1080)'),
    height: z.number().optional().describe('Canvas height (default: 1920)'),
    layers: z.string().optional().describe('JSON string of layers array'),
    background: z.string().optional().describe('Background color hex'),
    isTemplate: z.boolean().optional().describe('Mark as reusable template (default: true)'),
    tags: z.array(z.string()).optional().describe('Tags for searching'),
  },
  async ({ templateId, name, width, height, layers, background, isTemplate, tags }) => {
    try {
      // Get max order
      const maxOrder = await prisma.page.aggregate({
        where: { templateId },
        _max: { order: true },
      })

      const parsedLayers = layers ? JSON.parse(layers) : []

      const page = await prisma.page.create({
        data: {
          name,
          width: width ?? 1080,
          height: height ?? 1920,
          layers: parsedLayers,
          background: background ?? '#ffffff',
          order: (maxOrder._max.order ?? -1) + 1,
          isTemplate: isTemplate ?? true,
          tags: tags ?? [],
          templateId,
        },
      })

      return {
        content: [{ type: 'text' as const, text: JSON.stringify({ created: true, pageId: page.id, name: page.name }, null, 2) }],
      }
    } catch (error: any) {
      return { content: [{ type: 'text' as const, text: `Error: ${error.message}` }], isError: true }
    }
  },
)

// ═══════════════════════════════════════════════════════════════════════
// TOOL 5: list-posts
// ═══════════════════════════════════════════════════════════════════════

server.tool(
  'list-posts',
  'List posts by project, date range, status, or type',
  {
    projectId: z.number().describe('Project ID'),
    dateFrom: z.string().optional().describe('Start date (YYYY-MM-DD, BRT)'),
    dateTo: z.string().optional().describe('End date (YYYY-MM-DD, BRT)'),
    status: z.enum(['DRAFT', 'SCHEDULED', 'POSTING', 'POSTED', 'FAILED']).optional(),
    postType: z.enum(['STORY', 'POST', 'REEL', 'CAROUSEL']).optional(),
    limit: z.number().optional().describe('Max results (default: 50, max: 200)'),
  },
  async ({ projectId, dateFrom, dateTo, status, postType, limit }) => {
    try {
      const where: any = { projectId }
      if (status) where.status = status
      if (postType) where.postType = postType
      if (dateFrom || dateTo) {
        where.scheduledDatetime = {}
        if (dateFrom) where.scheduledDatetime.gte = parseBRT(dateFrom + ' 00:00')
        if (dateTo) where.scheduledDatetime.lte = parseBRT(dateTo + ' 23:59')
      }

      const posts = await prisma.socialPost.findMany({
        where,
        select: {
          id: true,
          postType: true,
          caption: true,
          scheduledDatetime: true,
          status: true,
          renderStatus: true,
          pageId: true,
          templateId: true,
          slotValues: true,
          mediaUrls: true,
          renderedImageUrl: true,
          createdAt: true,
        },
        orderBy: { scheduledDatetime: 'asc' },
        take: Math.min(limit ?? 50, 200),
      })

      const result = posts.map((p: any) => ({
        ...p,
        caption: p.caption?.length > 120 ? p.caption.slice(0, 120) + '...' : p.caption,
        scheduledBRT: p.scheduledDatetime ? formatBRT(p.scheduledDatetime) : null,
        mediaCount: p.mediaUrls?.length ?? 0,
      }))

      return {
        content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
      }
    } catch (error: any) {
      return { content: [{ type: 'text' as const, text: `Error: ${error.message}` }], isError: true }
    }
  },
)

// ═══════════════════════════════════════════════════════════════════════
// TOOL 6: create-post
// ═══════════════════════════════════════════════════════════════════════

server.tool(
  'create-post',
  'Create a scheduled post (template-based with pageId, or legacy with mediaUrls)',
  {
    projectId: z.number().describe('Project ID'),
    postType: z.enum(['STORY', 'POST', 'REEL', 'CAROUSEL']).describe('Post type'),
    caption: z.string().describe('Post caption'),
    scheduledDatetime: z.string().describe('Schedule time: "YYYY-MM-DD HH:mm" in BRT or ISO datetime'),
    status: z.enum(['DRAFT', 'SCHEDULED']).optional().describe('Post status (default: DRAFT)'),
    pageId: z.string().optional().describe('Page ID for template-based posts'),
    templateId: z.number().optional().describe('Template ID (auto-resolved from pageId if omitted)'),
    slotValues: z.string().optional().describe('JSON string of slot values for template rendering'),
    mediaUrls: z.array(z.string()).optional().describe('Media URLs for non-template posts'),
  },
  async ({ projectId, postType, caption, scheduledDatetime, status, pageId, templateId, slotValues, mediaUrls }) => {
    try {
      // Resolve userId from project
      const project = await prisma.project.findUnique({ where: { id: projectId }, select: { userId: true } })
      if (!project) return { content: [{ type: 'text' as const, text: 'Error: Project not found' }], isError: true }

      // Resolve templateId from pageId if needed
      let resolvedTemplateId = templateId
      if (pageId && !templateId) {
        const page = await prisma.page.findUnique({ where: { id: pageId }, select: { templateId: true } })
        resolvedTemplateId = page?.templateId ?? undefined
      }

      const parsedSlotValues = slotValues ? JSON.parse(slotValues) : undefined
      const postStatus = status ?? 'DRAFT'
      const hasPage = !!pageId

      // Determine renderStatus
      let renderStatus = 'NOT_NEEDED'
      if (hasPage && postStatus === 'SCHEDULED' && (!mediaUrls || mediaUrls.length === 0)) {
        renderStatus = 'PENDING'
      }

      const post = await prisma.socialPost.create({
        data: {
          projectId,
          userId: project.userId,
          postType,
          caption,
          mediaUrls: mediaUrls ?? [],
          scheduleType: 'SCHEDULED',
          scheduledDatetime: parseBRT(scheduledDatetime),
          status: postStatus,
          pageId: pageId ?? null,
          templateId: resolvedTemplateId ?? null,
          slotValues: parsedSlotValues ?? undefined,
          renderStatus: renderStatus as any,
        },
      })

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            created: true,
            postId: post.id,
            status: post.status,
            scheduledBRT: formatBRT(post.scheduledDatetime!),
            renderStatus: post.renderStatus,
          }, null, 2),
        }],
      }
    } catch (error: any) {
      return { content: [{ type: 'text' as const, text: `Error: ${error.message}` }], isError: true }
    }
  },
)

// ═══════════════════════════════════════════════════════════════════════
// TOOL 7: update-post
// ═══════════════════════════════════════════════════════════════════════

server.tool(
  'update-post',
  'Update a post: caption, schedule, status, slotValues, or mediaUrls',
  {
    postId: z.string().describe('Post ID'),
    caption: z.string().optional(),
    scheduledDatetime: z.string().optional().describe('"YYYY-MM-DD HH:mm" BRT or ISO'),
    status: z.enum(['DRAFT', 'SCHEDULED', 'POSTING', 'POSTED', 'FAILED']).optional(),
    slotValues: z.string().optional().describe('JSON string'),
    pageId: z.string().optional(),
    mediaUrls: z.array(z.string()).optional(),
  },
  async ({ postId, caption, scheduledDatetime, status, slotValues, pageId, mediaUrls }) => {
    try {
      const data: any = {}
      if (caption !== undefined) data.caption = caption
      if (scheduledDatetime !== undefined) data.scheduledDatetime = parseBRT(scheduledDatetime)
      if (slotValues !== undefined) data.slotValues = JSON.parse(slotValues)
      if (pageId !== undefined) data.pageId = pageId
      if (mediaUrls !== undefined) data.mediaUrls = mediaUrls

      // If changing to SCHEDULED and post has a pageId, set renderStatus to PENDING
      if (status) {
        data.status = status
        if (status === 'SCHEDULED') {
          const existing = await prisma.socialPost.findUnique({ where: { id: postId }, select: { pageId: true, mediaUrls: true } })
          const effectivePageId = pageId ?? existing?.pageId
          const effectiveMedia = mediaUrls ?? existing?.mediaUrls
          if (effectivePageId && (!effectiveMedia || effectiveMedia.length === 0)) {
            data.renderStatus = 'PENDING'
          }
        }
      }

      const updated = await prisma.socialPost.update({
        where: { id: postId },
        data,
        select: { id: true, status: true, renderStatus: true, scheduledDatetime: true, caption: true },
      })

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            updated: true,
            postId: updated.id,
            status: updated.status,
            renderStatus: updated.renderStatus,
            scheduledBRT: updated.scheduledDatetime ? formatBRT(updated.scheduledDatetime) : null,
          }, null, 2),
        }],
      }
    } catch (error: any) {
      return { content: [{ type: 'text' as const, text: `Error: ${error.message}` }], isError: true }
    }
  },
)

// ═══════════════════════════════════════════════════════════════════════
// TOOL 8: delete-posts
// ═══════════════════════════════════════════════════════════════════════

server.tool(
  'delete-posts',
  'Delete posts by IDs or date range. Safety: cannot delete POSTED posts.',
  {
    postIds: z.array(z.string()).optional().describe('Specific post IDs to delete'),
    projectId: z.number().optional().describe('Required when using date range'),
    dateFrom: z.string().optional().describe('Delete from this date (YYYY-MM-DD, BRT)'),
    dateTo: z.string().optional().describe('Delete until this date (YYYY-MM-DD, BRT)'),
    statusFilter: z.enum(['DRAFT', 'SCHEDULED', 'FAILED']).optional().describe('Only delete posts with this status'),
  },
  async ({ postIds, projectId, dateFrom, dateTo, statusFilter }) => {
    try {
      const where: any = {
        status: { not: 'POSTED' }, // Safety: never delete POSTED
      }

      if (postIds && postIds.length > 0) {
        where.id = { in: postIds }
      } else if (projectId && (dateFrom || dateTo)) {
        where.projectId = projectId
        if (statusFilter) where.status = statusFilter
        if (dateFrom || dateTo) {
          where.scheduledDatetime = {}
          if (dateFrom) where.scheduledDatetime.gte = parseBRT(dateFrom + ' 00:00')
          if (dateTo) where.scheduledDatetime.lte = parseBRT(dateTo + ' 23:59')
        }
      } else {
        return { content: [{ type: 'text' as const, text: 'Error: Provide postIds or projectId + date range' }], isError: true }
      }

      const result = await prisma.socialPost.deleteMany({ where })

      return {
        content: [{ type: 'text' as const, text: JSON.stringify({ deleted: result.count }, null, 2) }],
      }
    } catch (error: any) {
      return { content: [{ type: 'text' as const, text: `Error: ${error.message}` }], isError: true }
    }
  },
)

// ═══════════════════════════════════════════════════════════════════════
// TOOL 9: render-story
// ═══════════════════════════════════════════════════════════════════════

server.tool(
  'render-story',
  'Force server-side render of a template-based post. Renders PNG, uploads to Vercel Blob, updates post.',
  {
    postId: z.string().describe('Post ID to render'),
  },
  async ({ postId }) => {
    try {
      // 1. Fetch post
      const post = await prisma.socialPost.findUnique({
        where: { id: postId },
        select: { id: true, pageId: true, slotValues: true, renderStatus: true },
      })
      if (!post) return { content: [{ type: 'text' as const, text: 'Error: Post not found' }], isError: true }
      if (!post.pageId) return { content: [{ type: 'text' as const, text: 'Error: Post has no pageId (not template-based)' }], isError: true }

      // 2. Fetch page with template
      const page = await prisma.page.findUnique({
        where: { id: post.pageId },
        include: { Template: { select: { projectId: true } } },
      })
      if (!page) return { content: [{ type: 'text' as const, text: `Error: Page not found: ${post.pageId}` }], isError: true }

      // 3. Lock the post
      await prisma.socialPost.update({
        where: { id: postId },
        data: { renderStatus: 'RENDERING' },
      })

      // 4. Convert Page → DesignData
      const { convertPageToDesignData, applySlotValues } = await import('../src/lib/posts/page-to-design-data')
      let designData = convertPageToDesignData({
        id: page.id,
        name: page.name,
        width: page.width,
        height: page.height,
        layers: page.layers,
        background: page.background,
      })

      // 5. Apply slot values
      const slotValues = (post.slotValues as Record<string, unknown>) ?? {}
      if (Object.keys(slotValues).length > 0) {
        designData = applySlotValues(designData, slotValues)
      }

      // 6. Register project fonts
      const projectId = page.Template.projectId
      const fonts = await prisma.customFont.findMany({ where: { projectId } })
      if (fonts.length > 0) {
        const { GlobalFonts } = await import('@napi-rs/canvas')
        const fontDir = `/tmp/studio-lagosta-fonts/${projectId}`
        if (!fs.existsSync(fontDir)) fs.mkdirSync(fontDir, { recursive: true })

        for (const font of fonts) {
          const ext = path.extname(font.fileUrl) || '.otf'
          const filePath = path.join(fontDir, `${font.fontFamily}${ext}`)
          if (!fs.existsSync(filePath)) {
            try {
              const buf = await fetchBuffer(font.fileUrl)
              fs.writeFileSync(filePath, buf)
            } catch { continue }
          }
          try { GlobalFonts.registerFromPath(filePath, font.fontFamily) } catch { /* already registered */ }
        }
      }

      // 7. Render
      const { CanvasRenderer } = await import('../src/lib/canvas-renderer')
      const renderer = new CanvasRenderer(designData.canvas.width, designData.canvas.height)
      const buffer = await renderer.renderDesign(designData, {})

      // 8. Upload to Vercel Blob
      const timestamp = Date.now()
      const blobPath = `posts/rendered/${postId}-${timestamp}.png`
      const blob = await put(blobPath, buffer, { access: 'public', contentType: 'image/png' })

      // 9. Update post
      await prisma.socialPost.update({
        where: { id: postId },
        data: {
          renderStatus: 'RENDERED',
          renderedImageUrl: blob.url,
          renderedAt: new Date(),
          mediaUrls: [blob.url],
          blobPathnames: [blobPath],
        },
      })

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            rendered: true,
            postId,
            url: blob.url,
            width: designData.canvas.width,
            height: designData.canvas.height,
            sizeKB: Math.round(buffer.length / 1024),
          }, null, 2),
        }],
      }
    } catch (error: any) {
      // Reset render status on failure
      try {
        await prisma.socialPost.update({
          where: { id: postId },
          data: { renderStatus: 'RENDER_FAILED', renderError: error.message },
        })
      } catch { /* ignore */ }
      return { content: [{ type: 'text' as const, text: `Render error: ${error.message}` }], isError: true }
    }
  },
)

// ═══════════════════════════════════════════════════════════════════════
// TOOL 10: list-drive-images
// ═══════════════════════════════════════════════════════════════════════

server.tool(
  'list-drive-images',
  'List images from a project\'s Google Drive folder',
  {
    projectId: z.number().describe('Project ID'),
    folderId: z.string().optional().describe('Specific subfolder ID (default: project imagesFolderId)'),
    includeSubfolders: z.boolean().optional().describe('Include subfolder images (default: true)'),
    limit: z.number().optional().describe('Max results (default: 50)'),
  },
  async ({ projectId, folderId, includeSubfolders, limit }) => {
    try {
      const project = await prisma.project.findUnique({
        where: { id: projectId },
        select: { googleDriveImagesFolderId: true, googleDriveFolderId: true },
      })
      if (!project) return { content: [{ type: 'text' as const, text: 'Error: Project not found' }], isError: true }

      const rootFolderId = folderId ?? project.googleDriveImagesFolderId ?? project.googleDriveFolderId
      if (!rootFolderId) return { content: [{ type: 'text' as const, text: 'Error: No Drive folder configured' }], isError: true }

      const drive = getDrive()
      const maxResults = Math.min(limit ?? 50, 200)

      // List images in folder
      const listImages = async (parentId: string, folderName: string) => {
        const res = await drive.files.list({
          q: `'${parentId}' in parents and mimeType contains 'image/' and trashed = false`,
          fields: 'files(id,name,mimeType,thumbnailLink,createdTime,size)',
          pageSize: maxResults,
          orderBy: 'createdTime desc',
        })
        return (res.data.files ?? []).map((f: any) => ({
          driveFileId: f.id,
          fileName: f.name,
          folder: folderName,
          mimeType: f.mimeType,
          thumbnailLink: f.thumbnailLink,
          createdTime: f.createdTime,
          sizeBytes: f.size,
        }))
      }

      let images = await listImages(rootFolderId, '(root)')

      // Include subfolders
      if (includeSubfolders !== false) {
        const foldersRes = await drive.files.list({
          q: `'${rootFolderId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
          fields: 'files(id,name)',
          pageSize: 20,
        })
        for (const folder of foldersRes.data.files ?? []) {
          if (images.length >= maxResults) break
          const subImages = await listImages(folder.id!, folder.name!)
          images = images.concat(subImages)
        }
      }

      return {
        content: [{ type: 'text' as const, text: JSON.stringify(images.slice(0, maxResults), null, 2) }],
      }
    } catch (error: any) {
      return { content: [{ type: 'text' as const, text: `Error: ${error.message}` }], isError: true }
    }
  },
)

// ═══════════════════════════════════════════════════════════════════════
// TOOL 11: search-catalog
// ═══════════════════════════════════════════════════════════════════════

server.tool(
  'search-catalog',
  'Search the image catalog (_image-catalog.json) by theme, tags, quality, or menu category',
  {
    projectId: z.number().describe('Project ID'),
    theme: z.string().optional().describe('Theme to search (e.g., abertura, almoco, happy-hour)'),
    menuCategory: z.string().optional().describe('Menu category filter (e.g., PRATOS_PRINCIPAIS)'),
    tags: z.array(z.string()).optional().describe('Tags to match'),
    quality: z.enum(['alta', 'media', 'baixa']).optional().describe('Minimum quality'),
    limit: z.number().optional().describe('Max results (default: 20)'),
  },
  async ({ projectId, theme, menuCategory, tags, quality, limit }) => {
    try {
      const project = await prisma.project.findUnique({
        where: { id: projectId },
        select: { googleDriveImagesFolderId: true, googleDriveFolderId: true },
      })
      if (!project) return { content: [{ type: 'text' as const, text: 'Error: Project not found' }], isError: true }

      const imagesFolderId = project.googleDriveImagesFolderId ?? project.googleDriveFolderId
      if (!imagesFolderId) return { content: [{ type: 'text' as const, text: 'Error: No Drive folder' }], isError: true }

      const catalog = await loadCatalog(imagesFolderId)
      if (!catalog) return { content: [{ type: 'text' as const, text: 'Error: No catalog found. Run analyze-all-projects.ts first.' }], isError: true }

      let filtered = catalog.images

      // Quality filter
      if (quality) {
        const qualityOrder = { alta: 3, media: 2, baixa: 1 }
        const minQ = qualityOrder[quality] ?? 1
        filtered = filtered.filter((img) => (qualityOrder[img.quality as keyof typeof qualityOrder] ?? 1) >= minQ)
      }

      // Theme filter (bestFor or tags)
      if (theme) {
        const themeLower = theme.toLowerCase()
        filtered = filtered.filter((img) =>
          img.bestFor?.some((b) => b.toLowerCase().includes(themeLower))
          || img.tags?.some((t) => t.toLowerCase().includes(themeLower)),
        )
      }

      // Menu category filter
      if (menuCategory) {
        filtered = filtered.filter((img) => img.menuCategory === menuCategory)
      }

      // Tags filter
      if (tags && tags.length > 0) {
        const tagsLower = tags.map((t) => t.toLowerCase())
        filtered = filtered.filter((img) =>
          img.tags?.some((t) => tagsLower.includes(t.toLowerCase())),
        )
      }

      // Sort by least recently used
      filtered.sort((a, b) => {
        const aLast = a.usageHistory?.length ? a.usageHistory[a.usageHistory.length - 1].date : '2000-01-01'
        const bLast = b.usageHistory?.length ? b.usageHistory[b.usageHistory.length - 1].date : '2000-01-01'
        return aLast.localeCompare(bLast)
      })

      const results = filtered.slice(0, limit ?? 20).map((img) => ({
        driveFileId: img.driveFileId,
        fileName: img.fileName,
        folder: img.folder,
        menuItem: img.menuItem,
        menuCategory: img.menuCategory,
        tags: img.tags,
        bestFor: img.bestFor,
        quality: img.quality,
        description: img.description,
        lastUsed: img.usageHistory?.length
          ? img.usageHistory[img.usageHistory.length - 1].date
          : 'never',
        usageCount: img.usageHistory?.length ?? 0,
      }))

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({ total: filtered.length, showing: results.length, images: results }, null, 2),
        }],
      }
    } catch (error: any) {
      return { content: [{ type: 'text' as const, text: `Error: ${error.message}` }], isError: true }
    }
  },
)

// ═══════════════════════════════════════════════════════════════════════
// TOOL 12: get-image-thumbnail
// ═══════════════════════════════════════════════════════════════════════

server.tool(
  'get-image-thumbnail',
  'Get a Drive image thumbnail (URL or base64 for visual preview)',
  {
    driveFileId: z.string().describe('Google Drive file ID'),
    asBase64: z.boolean().optional().describe('Return base64 image data (default: false, returns URL only)'),
  },
  async ({ driveFileId, asBase64 }) => {
    try {
      const drive = getDrive()
      const file = await drive.files.get({
        fileId: driveFileId,
        fields: 'id,name,mimeType,thumbnailLink',
      })

      if (!asBase64) {
        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({
              driveFileId: file.data.id,
              name: file.data.name,
              mimeType: file.data.mimeType,
              thumbnailLink: file.data.thumbnailLink,
            }, null, 2),
          }],
        }
      }

      // Fetch thumbnail as base64
      if (!file.data.thumbnailLink) {
        return { content: [{ type: 'text' as const, text: 'Error: No thumbnail available' }], isError: true }
      }

      const buffer = await fetchBuffer(file.data.thumbnailLink)
      const base64 = buffer.toString('base64')

      return {
        content: [
          { type: 'text' as const, text: `Image: ${file.data.name}` },
          { type: 'image' as const, data: base64, mimeType: 'image/png' },
        ],
      }
    } catch (error: any) {
      return { content: [{ type: 'text' as const, text: `Error: ${error.message}` }], isError: true }
    }
  },
)

// ═══════════════════════════════════════════════════════════════════════
// TOOL 13: get-knowledge
// ═══════════════════════════════════════════════════════════════════════

server.tool(
  'get-knowledge',
  'Get knowledge base entries for a project (tone of voice, menu, hours, etc.)',
  {
    projectId: z.number().describe('Project ID'),
    category: z.enum([
      'ESTABELECIMENTO_INFO', 'HORARIOS', 'CARDAPIO', 'DELIVERY',
      'POLITICAS', 'TOM_DE_VOZ', 'CAMPANHAS', 'DIFERENCIAIS', 'FAQ',
    ]).optional().describe('Filter by category'),
  },
  async ({ projectId, category }) => {
    try {
      const where: any = { projectId, status: 'ACTIVE' }
      if (category) where.category = category

      const entries = await prisma.knowledgeBaseEntry.findMany({
        where,
        select: {
          id: true,
          title: true,
          content: true,
          category: true,
          tags: true,
        },
        orderBy: { category: 'asc' },
      })

      return {
        content: [{ type: 'text' as const, text: JSON.stringify(entries, null, 2) }],
      }
    } catch (error: any) {
      return { content: [{ type: 'text' as const, text: `Error: ${error.message}` }], isError: true }
    }
  },
)

// ═══════════════════════════════════════════════════════════════════════
// TOOL 14: plan-week
// ═══════════════════════════════════════════════════════════════════════

server.tool(
  'plan-week',
  'Plan a week of stories (7 days x 3 stories = 21). dryRun=true previews the plan; false creates DRAFT posts.',
  {
    projectId: z.number().describe('Project ID'),
    weekStart: z.string().optional().describe('ISO date of start day (e.g., 2026-03-25) or "next" for next Monday'),
    daysCount: z.number().optional().describe('Number of days to plan (default: 7)'),
    storiesPerDay: z.number().optional().describe('Stories per day (default: 3)'),
    storyConfigs: z.string().optional().describe('JSON array of [{label, localTime, theme}] overrides'),
    dryRun: z.boolean().optional().describe('Preview without creating posts (default: true)'),
  },
  async ({ projectId, weekStart, daysCount, storiesPerDay, storyConfigs, dryRun }) => {
    try {
      // 1. Find project
      const project = await prisma.project.findUnique({
        where: { id: projectId },
        select: {
          id: true, name: true, userId: true,
          googleDriveImagesFolderId: true, googleDriveFolderId: true,
        },
      })
      if (!project) return { content: [{ type: 'text' as const, text: 'Error: Project not found' }], isError: true }

      // 2. Determine start date
      const start = getWeekStart(weekStart ?? 'next')
      const numDays = daysCount ?? 7

      // 3. Load catalog
      const imagesFolderId = project.googleDriveImagesFolderId ?? project.googleDriveFolderId
      if (!imagesFolderId) return { content: [{ type: 'text' as const, text: 'Error: No Drive folder' }], isError: true }

      const catalog = await loadCatalog(imagesFolderId)
      if (!catalog || !catalog.images.length) {
        return { content: [{ type: 'text' as const, text: 'Error: No image catalog. Run analyze-all-projects.ts first.' }], isError: true }
      }

      // 4. Load KB & template pages
      const kb = await loadKB(projectId)
      const { pages } = await getTemplatePages(projectId)
      if (pages.length === 0) {
        return { content: [{ type: 'text' as const, text: 'Error: No template pages found' }], isError: true }
      }

      // 5. Story configs
      const defaultConfigs = [
        { label: 'Abertura', localTime: '09:00', theme: 'abertura' },
        { label: 'Almoco', localTime: '11:00', theme: 'almoco' },
        { label: 'Happy Hour', localTime: '17:00', theme: 'happy-hour' },
      ]
      const configs = storyConfigs ? JSON.parse(storyConfigs) : defaultConfigs.slice(0, storiesPerDay ?? 3)

      // 6. Plan each day
      const weekPlan: any[] = []
      const selectedImages = new Set<string>()

      for (let d = 0; d < numDays; d++) {
        const date = new Date(start)
        date.setDate(start.getDate() + d)
        const dateStr = formatDate(date)
        const dayOfWeek = DAY_NAMES[date.getDay()]

        // Select page for this day
        const dayPage = pages.find((p: any) =>
          p.templateName.toLowerCase().includes(dayOfWeek) || p.name.toLowerCase().includes(dayOfWeek),
        ) ?? pages[0]

        const stories = configs.map((config: any) => {
          const image = selectImage(catalog, config.theme, dateStr, selectedImages)
          if (image) selectedImages.add(image.driveFileId)

          // Convert local time to UTC (add 3h for BRT)
          const [hh, mm] = config.localTime.split(':').map(Number)
          const utcHH = String(hh + 3).padStart(2, '0')
          const utcTime = `${utcHH}:${String(mm).padStart(2, '0')}`

          return {
            label: config.label,
            localTime: config.localTime,
            utcTime,
            theme: config.theme,
            pageId: dayPage.id,
            pageName: dayPage.name,
            templateId: dayPage.templateId,
            templateName: dayPage.templateName,
            driveImageId: image?.driveFileId ?? null,
            driveImageName: image?.fileName ?? null,
            driveImageDescription: image?.description ?? null,
            texts: {
              title: DAY_TITLES[dayOfWeek] ?? dayOfWeek.toUpperCase(),
              subtitle: config.label.toUpperCase(),
            },
          }
        })

        weekPlan.push({ date: dateStr, dayOfWeek, stories })
      }

      const totalStories = weekPlan.reduce((sum: number, d: any) => sum + d.stories.length, 0)

      // 7. If dry run, return plan
      if (dryRun !== false) {
        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({
              dryRun: true,
              project: project.name,
              startDate: formatDate(start),
              days: numDays,
              totalStories,
              catalogImages: catalog.images.length,
              templatePages: pages.length,
              knowledgeEntries: kb.length,
              plan: weekPlan,
            }, null, 2),
          }],
        }
      }

      // 8. Create DRAFT posts
      let created = 0
      const postIds: string[] = []

      for (const day of weekPlan) {
        for (const story of day.stories) {
          const scheduledDatetime = new Date(`${day.date}T${story.utcTime}:00.000Z`)

          const slotValues: Record<string, unknown> = { ...story.texts }
          if (story.driveImageId) {
            slotValues._driveImageId = story.driveImageId
          }

          const post = await prisma.socialPost.create({
            data: {
              projectId: project.id,
              userId: project.userId,
              postType: 'STORY',
              caption: `${story.texts.title} ${story.texts.subtitle}`,
              mediaUrls: [],
              scheduleType: 'SCHEDULED',
              scheduledDatetime,
              status: 'DRAFT',
              pageId: story.pageId,
              templateId: story.templateId,
              slotValues: slotValues as any,
              renderStatus: 'NOT_NEEDED',
            },
          })

          postIds.push(post.id)
          created++
        }
      }

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            dryRun: false,
            created,
            postIds,
            plan: weekPlan,
          }, null, 2),
        }],
      }
    } catch (error: any) {
      return { content: [{ type: 'text' as const, text: `Error: ${error.message}` }], isError: true }
    }
  },
)

// ─── Start Server ────────────────────────────────────────────────────

async function main() {
  const transport = new StdioServerTransport()
  await server.connect(transport)
  console.error('[studio-lagosta-mcp] Server started on stdio')
}

// Graceful shutdown
process.on('SIGINT', async () => {
  await prisma.$disconnect()
  process.exit(0)
})
process.on('SIGTERM', async () => {
  await prisma.$disconnect()
  process.exit(0)
})

main().catch((e) => {
  console.error('[studio-lagosta-mcp] Fatal:', e)
  prisma.$disconnect()
  process.exit(1)
})
