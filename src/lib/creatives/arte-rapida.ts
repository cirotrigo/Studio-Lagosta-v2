/**
 * Arte Rápida — one-shot creative generation from a template page.
 *
 * Shared core used by both the local MCP server (scripts/mcp-server.ts) and
 * the service-to-service HTTP routes under /api/external/creatives, so the
 * behaviour is identical whether the request comes from Claude Code on this
 * machine or from Claudinho (insta-automatico) over the network.
 *
 * Flow:
 *   1. prepareCreative() — resolve project + best template page for a theme,
 *      returning the slots to fill plus brand/tone-of-voice context. The
 *      caller (an LLM) writes the copy.
 *   2. createArteRapida() — bake the copy and image into the page layers,
 *      persist it as a Page inside the project's "Arte Rápida" template,
 *      render to PNG and register it in the Criativos gallery.
 */

import { put } from '@vercel/blob'
import { db } from '@/lib/db'
import { convertPageToDesignData } from '@/lib/posts/page-to-design-data'
import { registerProjectFonts } from '@/lib/posts/register-project-fonts'
import { googleDriveService } from '@/server/google-drive-service'
import { KnowledgeCategory } from '@prisma/client'

/** Name of the per-project template that collects every arte-rápida output. */
export const ARTE_RAPIDA_TEMPLATE_NAME = 'Arte Rápida'

/** Knowledge base categories fed to the copywriter as context. */
const KB_CATEGORIES: KnowledgeCategory[] = [
  KnowledgeCategory.TOM_DE_VOZ,
  KnowledgeCategory.ESTABELECIMENTO_INFO,
  KnowledgeCategory.HORARIOS,
  KnowledgeCategory.DIFERENCIAIS,
  KnowledgeCategory.CARDAPIO,
  KnowledgeCategory.CAMPANHAS,
]

const KB_KEYS: Record<string, string> = {
  TOM_DE_VOZ: 'tomDeVoz',
  ESTABELECIMENTO_INFO: 'estabelecimento',
  HORARIOS: 'horarios',
  DIFERENCIAIS: 'diferenciais',
  CARDAPIO: 'cardapio',
  CAMPANHAS: 'campanhas',
}

/**
 * Domain error with a stable machine-readable code, so HTTP routes can map it
 * to a status and MCP tools can surface it as structured JSON.
 */
export class CreativeError extends Error {
  readonly code: string
  readonly status: number
  readonly details?: Record<string, unknown>

  constructor(code: string, message: string, status = 400, details?: Record<string, unknown>) {
    super(message)
    this.name = 'CreativeError'
    this.code = code
    this.status = status
    this.details = details
  }

  toJSON() {
    return { error: this.code, message: this.message, ...(this.details ?? {}) }
  }
}

function normalize(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, '-')
}

/**
 * Public URL used to build clickable links (editor, gallery). Priority:
 * STUDIO_LAGOSTA_PUBLIC_URL (lets a locally-run MCP point at production),
 * then NEXT_PUBLIC_APP_URL, then localhost.
 */
export function getPublicAppUrl(): string {
  const url =
    process.env.STUDIO_LAGOSTA_PUBLIC_URL ??
    process.env.NEXT_PUBLIC_APP_URL ??
    'http://localhost:3000'
  return url.replace(/\/$/, '')
}

function parseLayers(raw: unknown): any[] {
  if (Array.isArray(raw)) return raw as any[]
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw)
      return Array.isArray(parsed) ? parsed : []
    } catch {
      return []
    }
  }
  return []
}

// ─── prepare-creative ────────────────────────────────────────────────

export interface PrepareCreativeInput {
  /** Project name or substring (e.g., "Tero", "By Rock"). */
  projectHint?: string
  /** Exact project id — skips name matching. Preferred by service callers. */
  projectId?: number
  /** Theme of the creative (e.g., "almoço executivo", "happy hour"). */
  theme: string
  /** Optional day of week in PT (e.g., "sexta", "sabado"). */
  day?: string
}

export interface SlotField {
  layerId: string
  name: string
  type: string
  isDynamic: boolean
  currentValue: string
}

export interface PrepareCreativeResult {
  project: {
    id: number
    name: string
    instagramUsername: string | null
    googleDriveImagesFolderId: string | null
  }
  page: {
    id: string
    templateId: number
    templateName: string
    name: string
    width: number
    height: number
    tags: string[]
    templateTags: string[]
    slotFields: SlotField[]
  }
  alternatives: Array<{
    id: string
    name: string
    templateId: number
    templateName: string
    tags: string[]
    templateTags: string[]
  }>
  brand: {
    brandStyle: string | null
    cuisineType: string | null
    titleFontFamily: string | null
    bodyFontFamily: string | null
    logoUrl: string | null
    logos: unknown[]
    colors: unknown[]
    fonts: unknown[]
  }
  knowledge: Record<string, string>
}

const PROJECT_SELECT = {
  id: true,
  name: true,
  userId: true,
  googleDriveImagesFolderId: true,
  googleDriveFolderId: true,
  instagramUsername: true,
  logoUrl: true,
  titleFontFamily: true,
  bodyFontFamily: true,
  brandStyleDescription: true,
  cuisineType: true,
  BrandColor: { select: { name: true, hexCode: true }, orderBy: { id: 'asc' } },
  CustomFont: { select: { name: true, fontFamily: true, fileUrl: true }, orderBy: { id: 'asc' } },
  Logo: {
    select: { name: true, fileUrl: true, isProjectLogo: true },
    orderBy: [{ isProjectLogo: 'desc' }, { id: 'asc' }],
  },
} as const

async function resolveProject(input: Pick<PrepareCreativeInput, 'projectId' | 'projectHint'>) {
  if (input.projectId) {
    const project = await db.project.findUnique({
      where: { id: input.projectId },
      select: PROJECT_SELECT as any,
    })
    if (!project) {
      throw new CreativeError('PROJECT_NOT_FOUND', `Project not found: ${input.projectId}`, 404)
    }
    return project as any
  }

  const hint = input.projectHint?.trim()
  if (!hint) {
    throw new CreativeError('MISSING_PROJECT', 'Provide either projectId or projectHint', 400)
  }

  const projects = await db.project.findMany({
    where: { status: 'ACTIVE', name: { contains: hint, mode: 'insensitive' } },
    select: PROJECT_SELECT as any,
    orderBy: { name: 'asc' },
  })

  if (projects.length === 0) {
    throw new CreativeError('PROJECT_NOT_FOUND', `No active project matching "${hint}"`, 404)
  }
  if (projects.length > 1) {
    throw new CreativeError(
      'AMBIGUOUS_PROJECT',
      `Multiple projects match "${hint}". Re-run with a more specific hint.`,
      409,
      { candidates: projects.map((p: any) => ({ id: p.id, name: p.name })) },
    )
  }
  return projects[0] as any
}

/** All STORY template pages of a project, flattened with their template info. */
async function getStoryTemplatePages(projectId: number) {
  const templates = await db.template.findMany({
    where: { projectId, type: 'STORY' },
    include: {
      Page: {
        where: { isTemplate: true },
        select: { id: true, name: true, templateId: true, tags: true },
      },
    },
  })

  return templates.flatMap((t: any) =>
    t.Page.map((p: any) => ({
      ...p,
      templateName: t.name,
      templateId: t.id,
      templateTags: t.tags ?? [],
    })),
  )
}

/**
 * Resolve the project and the template page that best matches a theme/day,
 * returning the slots to fill plus brand and tone-of-voice context.
 */
export async function prepareCreative(input: PrepareCreativeInput): Promise<PrepareCreativeResult> {
  const project = await resolveProject(input)

  const allPages = await getStoryTemplatePages(project.id)
  if (allPages.length === 0) {
    throw new CreativeError(
      'NO_TEMPLATE_PAGES',
      `No template pages found for project "${project.name}". Create templates first.`,
      404,
      { project: { id: project.id, name: project.name } },
    )
  }

  // Theme matching: full normalized form, then main word, then each word
  const themeNorm = normalize(input.theme)
  const themeWords = themeNorm.split('-').filter((w) => w.length > 2)
  const themeVariants = Array.from(new Set([themeNorm, themeWords[0], ...themeWords].filter(Boolean)))

  const themeMatches = allPages.filter((p: any) => {
    const tags = [...(p.tags ?? []), ...(p.templateTags ?? [])].map(normalize)
    return themeVariants.some((v) => tags.some((t) => t === v || t.includes(v) || v.includes(t)))
  })

  // Optional day filter (legacy templates encode the day in the name)
  const dayNorm = input.day ? normalize(input.day).replace(/-feira$/, '') : null
  let candidates = themeMatches
  if (dayNorm) {
    const dayMatches = themeMatches.filter(
      (p: any) => normalize(p.name).includes(dayNorm) || normalize(p.templateName).includes(dayNorm),
    )
    if (dayMatches.length > 0) candidates = dayMatches
  }

  // Fallback: day alone, for legacy templates without theme tags
  if (candidates.length === 0 && dayNorm) {
    candidates = allPages.filter(
      (p: any) => normalize(p.name).includes(dayNorm) || normalize(p.templateName).includes(dayNorm),
    )
  }

  if (candidates.length === 0) {
    const availableTags = Array.from(
      new Set(allPages.flatMap((p: any) => [...(p.tags ?? []), ...(p.templateTags ?? [])])),
    ).slice(0, 30)
    const availableTemplates = Array.from(new Set(allPages.map((p: any) => p.templateName)))
    throw new CreativeError(
      'NO_TEMPLATE_MATCH',
      `No template page found for theme "${input.theme}"${input.day ? ` and day "${input.day}"` : ''} in project "${project.name}".`,
      404,
      {
        project: { id: project.id, name: project.name },
        availableTags,
        availableTemplates,
        suggestion:
          'Tag a template page with the theme (e.g., "almoco-executivo") via the admin, or pick from availableTemplates and re-run.',
      },
    )
  }

  const bestRef = candidates[0]
  const alternatives = candidates.slice(1, 5).map((p: any) => ({
    id: p.id,
    name: p.name,
    templateId: p.templateId,
    templateName: p.templateName,
    tags: p.tags ?? [],
    templateTags: p.templateTags ?? [],
  }))

  const page = await db.page.findUnique({
    where: { id: bestRef.id },
    select: {
      id: true,
      templateId: true,
      name: true,
      tags: true,
      layers: true,
      width: true,
      height: true,
      background: true,
    },
  })
  if (!page) {
    throw new CreativeError('PAGE_NOT_FOUND', `Page not found: ${bestRef.id}`, 404)
  }

  const slotFields: SlotField[] = parseLayers(page.layers)
    .filter((l: any) => l.type === 'text' || (l.type === 'image' && l.isDynamic))
    .map((l: any) => ({
      layerId: l.id,
      name: l.name,
      type: l.type,
      isDynamic: !!l.isDynamic,
      currentValue: l.type === 'text' ? (l.content ?? '') : (l.fileUrl ?? ''),
    }))

  const kbEntries = await db.knowledgeBaseEntry.findMany({
    where: {
      projectId: project.id,
      status: 'ACTIVE',
      category: { in: KB_CATEGORIES },
    },
    select: { category: true, title: true, content: true },
    orderBy: { category: 'asc' },
  })

  const knowledge: Record<string, string> = {}
  for (const entry of kbEntries) {
    const key = KB_KEYS[entry.category] ?? entry.category
    knowledge[key] = knowledge[key] ? `${knowledge[key]}\n---\n${entry.content}` : entry.content
  }

  return {
    project: {
      id: project.id,
      name: project.name,
      instagramUsername: project.instagramUsername,
      googleDriveImagesFolderId: project.googleDriveImagesFolderId ?? project.googleDriveFolderId,
    },
    page: {
      id: page.id,
      templateId: page.templateId,
      templateName: bestRef.templateName,
      name: page.name,
      width: page.width,
      height: page.height,
      tags: page.tags ?? [],
      templateTags: bestRef.templateTags ?? [],
      slotFields,
    },
    alternatives,
    brand: {
      brandStyle: project.brandStyleDescription,
      cuisineType: project.cuisineType,
      titleFontFamily: project.titleFontFamily,
      bodyFontFamily: project.bodyFontFamily,
      logoUrl: project.logoUrl,
      logos: project.Logo,
      colors: project.BrandColor,
      fonts: project.CustomFont,
    },
    knowledge,
  }
}

// ─── create-arte-rapida ──────────────────────────────────────────────

export interface CreateArteRapidaInput {
  projectId: number
  /** Source template page id (from prepareCreative().page.id). */
  sourcePageId: string
  /**
   * Values keyed by layer id or layer name. A string sets text content;
   * an object may carry `content` and/or `fileUrl`. Two reserved keys:
   * `_driveImageId` (Google Drive file) and `_imageUrl` (direct URL).
   */
  slotValues: Record<string, unknown>
  /** Name for the generated page (default: "<source name> — <timestamp>"). */
  name?: string
  /** Direct image URL, e.g. a Supabase/Blob upload. Wins over _driveImageId. */
  imageUrl?: string
}

export interface CreateArteRapidaResult {
  created: true
  generationId: string
  pageId: string
  templateId: number
  templateName: string
  url: string
  editUrl: string
  galleryUrl: string
  width: number
  height: number
  sizeKB: number
  imageApplied: boolean
  /** Set when the requested photo could not be applied, with the reason. */
  imageWarning?: string
}

/**
 * Resolve the background image URL from either a direct URL or a Drive file id.
 *
 * Drive failures are non-fatal — the creative still renders, just with whatever
 * image the template carried. The reason is returned so the caller can say so
 * instead of silently shipping the wrong photo.
 */
async function resolveImageUrl(
  imageUrl?: string,
  driveImageId?: string | null,
): Promise<{ url: string | null; warning?: string }> {
  if (imageUrl) return { url: imageUrl }
  if (!driveImageId) return { url: null }

  if (!googleDriveService.isEnabled()) {
    return { url: null, warning: 'Google Drive não configurado neste ambiente (GOOGLE_DRIVE_CLIENT_ID/SECRET/REFRESH_TOKEN)' }
  }

  try {
    const file = await googleDriveService.getFileMetadata(driveImageId, 'thumbnailLink')
    const thumbnailLink = (file as { thumbnailLink?: string }).thumbnailLink
    if (thumbnailLink) return { url: thumbnailLink.replace(/=s\d+$/, '=s1920') }
    return { url: null, warning: `Arquivo ${driveImageId} do Drive não tem thumbnailLink (não é imagem?)` }
  } catch (error) {
    const message = (error as Error).message
    console.error('[arte-rapida] Drive resolve failed:', message)
    return { url: null, warning: `Falha ao resolver a imagem no Drive: ${message}` }
  }
}

/**
 * Bake slot values and the background image into a copy of the source layers.
 *
 * Image placement: an explicit `fileUrl` slot always wins. Otherwise the photo
 * goes to the first empty dynamic image layer (the common case); if every
 * candidate already carries a static image, it replaces the first one — without
 * that fallback, templates with a hardcoded background silently ignore the photo.
 */
function bakeLayers(
  sourceLayers: any[],
  slotValues: Record<string, unknown>,
  imageUrl: string | null,
): { layers: any[]; imageApplied: boolean } {
  const explicitFileUrl = new Set<string>()

  const layers = sourceLayers.map((layer: any) => {
    const slot = slotValues[layer.id] ?? slotValues[layer.name]
    const updated = { ...layer }

    if (typeof slot === 'string') {
      updated.content = slot
    } else if (slot && typeof slot === 'object') {
      const slotObj = slot as Record<string, unknown>
      if (typeof slotObj.content === 'string') updated.content = slotObj.content
      if (typeof slotObj.fileUrl === 'string') {
        updated.fileUrl = slotObj.fileUrl
        explicitFileUrl.add(layer.id)
      }
    }
    return updated
  })

  if (!imageUrl) return { layers, imageApplied: false }

  const isImageTarget = (layer: any) =>
    layer.type === 'image' && (layer.isDynamic || layer.id === 'bg-img') && !explicitFileUrl.has(layer.id)

  const target =
    layers.find((l: any) => isImageTarget(l) && !l.fileUrl) ?? layers.find(isImageTarget)

  if (!target) return { layers, imageApplied: false }

  target.fileUrl = imageUrl
  return { layers, imageApplied: true }
}

/** Find (or create on first use) the project's "Arte Rápida" template. */
async function ensureArteRapidaTemplate(projectId: number, userId: string, sourceTemplate: any) {
  const existing = await db.template.findFirst({
    where: { projectId, name: ARTE_RAPIDA_TEMPLATE_NAME },
  })
  if (existing) return existing

  return db.template.create({
    data: {
      name: ARTE_RAPIDA_TEMPLATE_NAME,
      type: sourceTemplate.type,
      dimensions: sourceTemplate.dimensions,
      projectId,
      createdBy: userId,
      designData: {} as any,
      dynamicFields: [] as any,
      tags: ['arte-rapida'],
      category: 'arte-rapida',
    },
  })
}

/**
 * Generate a creative from a source template page: bakes copy and image into
 * the layers, persists an editable Page under the project's "Arte Rápida"
 * template, renders it to Vercel Blob and registers it in the Criativos gallery.
 */
export async function createArteRapida(input: CreateArteRapidaInput): Promise<CreateArteRapidaResult> {
  const { projectId, sourcePageId, slotValues } = input

  const project = await db.project.findUnique({
    where: { id: projectId },
    select: { id: true, name: true, userId: true },
  })
  if (!project) {
    throw new CreativeError('PROJECT_NOT_FOUND', `Project not found: ${projectId}`, 404)
  }

  const sourcePage = await db.page.findUnique({
    where: { id: sourcePageId },
    include: { Template: true },
  })
  if (!sourcePage) {
    throw new CreativeError('SOURCE_PAGE_NOT_FOUND', `Source page not found: ${sourcePageId}`, 404)
  }
  if (sourcePage.Template.projectId !== projectId) {
    throw new CreativeError(
      'SOURCE_PAGE_MISMATCH',
      `Source page ${sourcePageId} belongs to project ${sourcePage.Template.projectId}, not ${projectId}`,
      400,
    )
  }

  const arteTemplate = await ensureArteRapidaTemplate(projectId, project.userId, sourcePage.Template)

  const driveImageId = typeof slotValues._driveImageId === 'string' ? slotValues._driveImageId : null
  const directUrl =
    input.imageUrl ?? (typeof slotValues._imageUrl === 'string' ? slotValues._imageUrl : undefined)
  const resolved = await resolveImageUrl(directUrl, driveImageId)

  const { layers, imageApplied } = bakeLayers(parseLayers(sourcePage.layers), slotValues, resolved.url)

  const imageWarning =
    resolved.warning ??
    (resolved.url && !imageApplied
      ? 'A imagem foi resolvida mas o template não tem camada de imagem dinâmica para recebê-la'
      : undefined)

  const pageName = input.name ?? `${sourcePage.name} — ${new Date().toLocaleString('pt-BR')}`
  const newPage = await db.page.create({
    data: {
      name: pageName,
      width: sourcePage.width,
      height: sourcePage.height,
      layers: layers as any,
      background: sourcePage.background,
      order: 0,
      templateId: arteTemplate.id,
      isTemplate: false, // rendered artwork, not a reusable modelo
      tags: ['arte-rapida'],
    },
  })

  const designData = convertPageToDesignData({
    id: newPage.id,
    name: newPage.name,
    width: newPage.width,
    height: newPage.height,
    layers: newPage.layers,
    background: newPage.background,
  })

  await registerProjectFonts(projectId)

  const { CanvasRenderer } = await import('@/lib/canvas-renderer')
  const renderer = new CanvasRenderer(designData.canvas.width, designData.canvas.height)
  const buffer = await renderer.renderDesign(designData, {})

  const blobPath = `arte-rapida/${projectId}/${newPage.id}-${Date.now()}.png`
  const blob = await put(blobPath, buffer, { access: 'public', contentType: 'image/png' })

  await db.page.update({ where: { id: newPage.id }, data: { thumbnail: blob.url } })

  const generation = await db.generation.create({
    data: {
      status: 'COMPLETED' as any,
      templateId: arteTemplate.id,
      fieldValues: {
        source: 'arte-rapida',
        sourceTemplateId: sourcePage.Template.id,
        sourceTemplateName: sourcePage.Template.name,
        sourcePageId: sourcePage.id,
        sourcePageName: sourcePage.name,
        sourceTags: sourcePage.tags ?? [],
        driveImageId,
        imageUrl: resolved.url ?? directUrl ?? null,
        slotValues,
        thumbnailUrl: blob.url,
      } as any,
      resultUrl: blob.url,
      projectId,
      createdBy: project.userId,
      authorName: 'arte-rapida',
      templateName: ARTE_RAPIDA_TEMPLATE_NAME,
      projectName: project.name,
      completedAt: new Date(),
      fileName: `${pageName}.png`,
    },
  })

  const appUrl = getPublicAppUrl()

  return {
    created: true,
    generationId: generation.id,
    pageId: newPage.id,
    templateId: arteTemplate.id,
    templateName: ARTE_RAPIDA_TEMPLATE_NAME,
    url: blob.url,
    editUrl: `${appUrl}/templates/${arteTemplate.id}/editor?pageId=${encodeURIComponent(newPage.id)}`,
    galleryUrl: `${appUrl}/projects/${projectId}?tab=criativos`,
    width: designData.canvas.width,
    height: designData.canvas.height,
    sizeKB: Math.round(buffer.length / 1024),
    imageApplied,
    ...(imageWarning ? { imageWarning } : {}),
  }
}
