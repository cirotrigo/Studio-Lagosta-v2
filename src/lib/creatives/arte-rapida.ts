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

import { db } from '@/lib/db'
import { KnowledgeCategory } from '@prisma/client'
import { CreativeError } from '@/lib/creatives/errors'
import {
  ARTE_TEMPLATE_NAMES,
  ensureArteTemplate,
  getPublicAppUrl,
  persistAndRenderCreative,
  renderPageAndRegister,
  resolveImageUrl,
} from '@/lib/creatives/persist'
import { invalidateScheduledRenders } from '@/lib/posts/invalidate-renders'
import { reflowLayersAfterFill } from '@/lib/combo-stack-reflow'
import { createServerTextMeasurer } from '@/lib/creatives/server-text-measurer'
import { registerProjectFonts } from '@/lib/posts/register-project-fonts'
import type { Layer } from '@/types/template'

export { CreativeError, getPublicAppUrl }

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

function normalize(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, '-')
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
    /** DNA da marca (aba Marca) — identidade que vale para TODA arte/copy. */
    dna: {
      toneOfVoice: string | null
      contentRules: string | null
      composition: string | null
      visualStyle: string | null
      photoDirection: string | null
    } | null
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
  brandDNA: true,
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
      // brandStyle mantém o nome antigo para não quebrar as skills que já
      // leem este bloco; o DNA visualStyle tem prioridade sobre o legado.
      brandStyle: project.brandDNA?.visualStyle ?? project.brandStyleDescription,
      cuisineType: project.cuisineType,
      titleFontFamily: project.titleFontFamily,
      bodyFontFamily: project.bodyFontFamily,
      logoUrl: project.logoUrl,
      logos: project.Logo,
      colors: project.BrandColor,
      fonts: project.CustomFont,
      dna: project.brandDNA
        ? {
            toneOfVoice: project.brandDNA.toneOfVoice,
            contentRules: project.brandDNA.contentRules,
            composition: project.brandDNA.composition,
            visualStyle: project.brandDNA.visualStyle,
            photoDirection: project.brandDNA.photoDirection,
          }
        : null,
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
): { layers: any[]; imageApplied: boolean; changedTextIds: string[] } {
  const explicitFileUrl = new Set<string>()
  const changedTextIds: string[] = []

  const layers = sourceLayers.map((layer: any) => {
    const slot = slotValues[layer.id] ?? slotValues[layer.name]
    const updated = { ...layer }

    if (typeof slot === 'string') {
      updated.content = slot
      if (layer.type === 'text') changedTextIds.push(layer.id)
    } else if (slot && typeof slot === 'object') {
      const slotObj = slot as Record<string, unknown>
      if (typeof slotObj.content === 'string') {
        updated.content = slotObj.content
        if (layer.type === 'text') changedTextIds.push(layer.id)
      }
      if (typeof slotObj.fileUrl === 'string') {
        updated.fileUrl = slotObj.fileUrl
        explicitFileUrl.add(layer.id)
      }
    }
    return updated
  })

  if (!imageUrl) return { layers, imageApplied: false, changedTextIds }

  const isImageTarget = (layer: any) =>
    layer.type === 'image' && (layer.isDynamic || layer.id === 'bg-img') && !explicitFileUrl.has(layer.id)

  const target =
    layers.find((l: any) => isImageTarget(l) && !l.fileUrl) ?? layers.find(isImageTarget)

  if (!target) return { layers, imageApplied: false, changedTextIds }

  target.fileUrl = imageUrl
  return { layers, imageApplied: true, changedTextIds }
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

  const arteTemplate = await ensureArteTemplate(
    projectId,
    project.userId,
    sourcePage.Template.type,
    sourcePage.Template.dimensions,
  )

  const driveImageId = typeof slotValues._driveImageId === 'string' ? slotValues._driveImageId : null
  const directUrl =
    input.imageUrl ?? (typeof slotValues._imageUrl === 'string' ? slotValues._imageUrl : undefined)
  const resolved = await resolveImageUrl(directUrl, driveImageId)

  const { layers: bakedLayers, imageApplied, changedTextIds } = bakeLayers(parseLayers(sourcePage.layers), slotValues, resolved.url)

  // Texto novo maior (ou menor) que o do template: medir a quebra real e
  // reacomodar as pilhas de combinação; texto solto cresce a própria caixa
  // (autoExpand) em vez de truncar. Fontes registradas ANTES de medir.
  await registerProjectFonts(projectId)
  const measure = await createServerTextMeasurer()
  const layers = reflowLayersAfterFill(bakedLayers as Layer[], changedTextIds, measure)

  const imageWarning =
    resolved.warning ??
    (resolved.url && !imageApplied
      ? 'A imagem foi resolvida mas o template não tem camada de imagem dinâmica para recebê-la'
      : undefined)

  const pageName = input.name ?? `${sourcePage.name} — ${new Date().toLocaleString('pt-BR')}`

  const persisted = await persistAndRenderCreative({
    project,
    templateId: arteTemplate.id,
    templateName: arteTemplate.name,
    pageName,
    width: sourcePage.width,
    height: sourcePage.height,
    layers,
    background: sourcePage.background,
    authorName: 'arte-rapida',
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
    },
  })

  return {
    created: true,
    ...persisted,
    templateName: ARTE_RAPIDA_TEMPLATE_NAME,
    imageApplied,
    ...(imageWarning ? { imageWarning } : {}),
  }
}

// ─── ajustar-arte ────────────────────────────────────────────────────

export interface AjustarArteInput {
  projectId: number
  /** A página gerada (pageId de createArteRapida/createArteLivre). */
  pageId: string
  /** Mesmo formato do createArteRapida: chave = id ou nome da camada. */
  slotValues?: Record<string, unknown>
  /** Troca a foto de fundo (mesma regra de destino do createArteRapida). */
  imageUrl?: string
  driveImageId?: string
  /** Renomeia a página. */
  name?: string
}

export interface AjustarArteResult {
  ajustada: true
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
  imageWarning?: string
  /** Nomes das camadas de texto que mudaram. */
  camposAlterados: string[]
  /** Posts da agenda que voltaram à fila de render por usarem esta página. */
  postsInvalidados: number
}

/**
 * Ajusta uma arte já gerada: aplica novos textos/foto nas camadas da MESMA
 * página, re-renderiza e registra uma nova Generation (a anterior fica na
 * galeria como histórico). Posts da agenda que usam a página são invalidados
 * para o cron re-renderizar — regra da casa para qualquer escrita em
 * Page.layers.
 *
 * Recusa páginas-modelo (isTemplate): mexer nelas mudaria TODAS as artes
 * futuras daquele tema e os posts agendados que as referenciam — modelo se
 * edita no editor, com a invalidação por mudança visual real do PATCH.
 */
export async function ajustarArte(input: AjustarArteInput): Promise<AjustarArteResult> {
  const { projectId, pageId } = input
  const slotValues = input.slotValues ?? {}

  const temAjuste =
    Object.keys(slotValues).length > 0 || input.imageUrl || input.driveImageId || input.name
  if (!temAjuste) {
    throw new CreativeError(
      'SEM_AJUSTE',
      'Nada para ajustar: envie slotValues, imageUrl/driveImageId ou name.',
      400,
    )
  }

  const project = await db.project.findUnique({
    where: { id: projectId },
    select: { id: true, name: true, userId: true },
  })
  if (!project) {
    throw new CreativeError('PROJECT_NOT_FOUND', `Project not found: ${projectId}`, 404)
  }

  const page = await db.page.findUnique({
    where: { id: pageId },
    include: { Template: { select: { id: true, name: true, projectId: true } } },
  })
  if (!page || page.Template.projectId !== projectId) {
    throw new CreativeError('PAGE_NOT_FOUND', `Página não encontrada neste projeto: ${pageId}`, 404)
  }
  if (page.isTemplate) {
    throw new CreativeError(
      'PAGINA_E_MODELO',
      'Esta página é um MODELO do cliente, não uma arte gerada. Ajustar aqui mudaria todas as artes futuras do tema — modelos se editam no editor.',
      400,
    )
  }

  const driveImageId =
    input.driveImageId ??
    (typeof slotValues._driveImageId === 'string' ? slotValues._driveImageId : null)
  const directUrl =
    input.imageUrl ?? (typeof slotValues._imageUrl === 'string' ? slotValues._imageUrl : undefined)
  const resolved = await resolveImageUrl(directUrl, driveImageId)

  const sourceLayers = parseLayers(page.layers)
  const baked = bakeLayers(sourceLayers, slotValues, resolved.url)
  const { layers: bakedLayers, changedTextIds } = baked
  let imageApplied = baked.imageApplied

  // Arte-livre não marca o fundo como dinâmico (a camada nasce aqui, não num
  // template): sem este fallback, trocar a foto de uma arte criada do zero
  // seria impossível. A primeira camada de imagem é o fundo nos dois geradores.
  if (!imageApplied && resolved.url) {
    const fundo = (bakedLayers as any[]).find((l) => l.type === 'image')
    if (fundo) {
      fundo.fileUrl = resolved.url
      imageApplied = true
    }
  }

  await registerProjectFonts(projectId)
  const measure = await createServerTextMeasurer()
  const layers = reflowLayersAfterFill(bakedLayers as Layer[], changedTextIds, measure)

  const imageWarning =
    resolved.warning ??
    (resolved.url && !imageApplied
      ? 'A imagem foi resolvida mas a arte não tem camada de imagem dinâmica para recebê-la'
      : undefined)

  const pageName = input.name ?? page.name
  await db.page.update({
    where: { id: page.id },
    data: { layers: layers as any, ...(input.name ? { name: input.name } : {}) },
  })

  // Textos FINAIS da arte, por nome de camada — é o que alimenta a verificação
  // por visão do conferir-arte e do melhorar-arte (extractExpectedTexts lê
  // slotValues), então precisa refletir a página como ficou, não só o patch.
  const slotValuesFinais = Object.fromEntries(
    (layers as any[])
      .filter((l) => l.type === 'text' && typeof l.content === 'string' && l.content.trim())
      .map((l) => [l.name ?? l.id, l.content]),
  )

  const persisted = await renderPageAndRegister({
    project,
    templateId: page.Template.id,
    templateName: page.Template.name,
    page: {
      id: page.id,
      name: pageName,
      width: page.width,
      height: page.height,
      layers,
      background: page.background,
    },
    authorName: 'ajuste-arte',
    fieldValues: {
      source: 'ajuste-arte',
      sourcePageId: page.id,
      ajustes: slotValues,
      slotValues: slotValuesFinais,
      driveImageId,
      imageUrl: resolved.url ?? directUrl ?? null,
    },
  })

  // Page.layers mudou: posts da agenda que usam esta página precisam voltar à
  // fila de render, senão publicam a arte antiga em silêncio.
  const postsInvalidados = await invalidateScheduledRenders(db, { pageIds: [page.id] })

  const camposAlterados = (layers as any[])
    .filter((l) => changedTextIds.includes(l.id))
    .map((l) => l.name ?? l.id)

  return {
    ajustada: true,
    ...persisted,
    imageApplied,
    ...(imageWarning ? { imageWarning } : {}),
    camposAlterados,
    postsInvalidados,
  }
}
