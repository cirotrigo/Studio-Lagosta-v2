/**
 * Persistência comum das artes geradas fora do editor.
 *
 * Tanto a arte a partir de modelo (arte-rapida) quanto a arte montada do zero
 * (arte-livre) terminam igual: viram uma Page editável dentro do template
 * coletor do projeto, são renderizadas para o Blob e entram na galeria de
 * Criativos. Só o miolo das camadas muda.
 */

import type { CanalDaArte } from './canal'
import { put } from '@vercel/blob'
import { db } from '@/lib/db'
import { convertPageToDesignData } from '@/lib/posts/page-to-design-data'
import { registerProjectFonts } from '@/lib/posts/register-project-fonts'
import { googleDriveService } from '@/server/google-drive-service'
import type { TemplateType } from '@prisma/client'

/**
 * Template coletor por formato. O nome do story ficou sem sufixo porque já
 * existe em produção desde o primeiro arte-rápida.
 */
export const ARTE_TEMPLATE_NAMES: Record<TemplateType, string> = {
  STORY: 'Arte Rápida',
  FEED: 'Arte Rápida — Feed',
  SQUARE: 'Arte Rápida — Quadrado',
}

export const FORMAT_PRESETS = {
  story: { width: 1080, height: 1920, type: 'STORY' as TemplateType },
  feed: { width: 1080, height: 1350, type: 'FEED' as TemplateType },
  quadrado: { width: 1080, height: 1080, type: 'SQUARE' as TemplateType },
}

export type FormatoArte = keyof typeof FORMAT_PRESETS

/** Deduz o formato a partir das dimensões, para artes com tamanho custom. */
export function inferTemplateType(width: number, height: number): TemplateType {
  if (height > width) return 'STORY'
  if (height === width) return 'SQUARE'
  return 'FEED'
}

/**
 * Acha (ou cria no primeiro uso) o template coletor do projeto para o formato.
 *
 * `templateName` sobrepõe o nome padrão — é como a arte trazida de fora
 * (arte-enviada) fica num coletor separado, sem se misturar com o que o
 * gerador produziu.
 */
export async function ensureArteTemplate(
  projectId: number,
  userId: string,
  type: TemplateType,
  dimensions: string,
  templateName?: string,
) {
  const name = templateName ?? ARTE_TEMPLATE_NAMES[type]
  const existing = await db.template.findFirst({ where: { projectId, name } })
  if (existing) return existing

  return db.template.create({
    data: {
      name,
      type,
      dimensions,
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
 * Resolve a URL da imagem de fundo — URL direta ou arquivo do Drive.
 *
 * Foto do Drive vira CÓPIA PERMANENTE no Blob: o thumbnailLink do Drive é
 * assinado e EXPIRA em horas — servia enquanto o render era imediato, mas a
 * página fica com a URL morta (403) para o editor e para qualquer re-render
 * do cron (78 páginas antigas estão assim). O caminho é determinístico por
 * arquivo: repetir a mesma foto na semana reusa o mesmo blob.
 *
 * Falha no Drive não é fatal: a arte ainda renderiza. O motivo volta junto
 * para o chamador poder avisar, em vez de entregar a foto errada calado.
 */
export async function resolveImageUrl(
  imageUrl?: string,
  driveImageId?: string | null,
): Promise<{ url: string | null; warning?: string }> {
  if (imageUrl) return { url: imageUrl }
  if (!driveImageId) return { url: null }

  if (!googleDriveService.isEnabled()) {
    return {
      url: null,
      warning: 'Google Drive não configurado neste ambiente (GOOGLE_DRIVE_CLIENT_ID/SECRET/REFRESH_TOKEN)',
    }
  }

  try {
    const file = await googleDriveService.getFileMetadata(driveImageId, 'thumbnailLink')
    const thumbnailLink = (file as { thumbnailLink?: string }).thumbnailLink
    if (!thumbnailLink) {
      return { url: null, warning: `Arquivo ${driveImageId} do Drive não tem thumbnailLink (não é imagem?)` }
    }

    const { fetchBuffer } = await import('@/lib/posts/register-project-fonts')
    const buffer = await fetchBuffer(thumbnailLink.replace(/=s\d+$/, '=s1920'))
    const blob = await put(`drive-cache/${driveImageId}-s1920.jpg`, buffer, {
      access: 'public',
      contentType: 'image/jpeg',
      addRandomSuffix: false,
      allowOverwrite: true,
    })
    return { url: blob.url }
  } catch (error) {
    const message = (error as Error).message
    console.error('[creatives] Drive resolve failed:', message)
    return { url: null, warning: `Falha ao resolver a imagem no Drive: ${message}` }
  }
}

export function getPublicAppUrl(): string {
  const url =
    process.env.STUDIO_LAGOSTA_PUBLIC_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'
  return url.replace(/\/$/, '')
}

export interface PersistCreativeInput {
  project: { id: number; name: string; userId: string }
  templateId: number
  templateName: string
  pageName: string
  width: number
  height: number
  layers: unknown[]
  background?: string | null
  /** Procedência guardada na Generation (o que gerou a arte) */
  fieldValues: Record<string, unknown>
  authorName: string
  /** Por qual canal a arte entrou — decidido na porta de entrada. Ver `canal.ts`. */
  canal?: CanalDaArte | null
  /**
   * Espelho colunar de `fieldValues.sourcePageId` — **só quando aponta para
   * uma página-MODELO de verdade**.
   *
   * O `fieldValues` homônimo é ambíguo: `ajustar-arte` grava ali a página que
   * ela mesma ajustou (a cópia). A coluna existe para a mineração ("qual
   * modelo este cliente mais usa") sair da varredura de Json, e só serve se
   * não herdar essa ambiguidade — por isso o ajuste NÃO a preenche.
   */
  sourcePageId?: string | null
}

export interface PersistCreativeResult {
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
}

/** Cria a Page, renderiza o PNG, sobe pro Blob e registra a Generation. */
export async function persistAndRenderCreative(
  input: PersistCreativeInput,
): Promise<PersistCreativeResult> {
  const { project, templateId, templateName, pageName, width, height, layers, background } = input

  const page = await db.page.create({
    data: {
      name: pageName,
      width,
      height,
      layers: layers as any,
      background: background ?? null,
      order: 0,
      templateId,
      isTemplate: false, // arte renderizada, não um modelo reutilizável
      tags: ['arte-rapida'],
    },
  })

  return renderPageAndRegister({
    project,
    templateId,
    templateName,
    page,
    fieldValues: input.fieldValues,
    authorName: input.authorName,
    sourcePageId: input.sourcePageId ?? null,
  })
}

export interface RenderPageInput {
  project: { id: number; name: string; userId: string }
  templateId: number
  templateName: string
  page: {
    id: string
    name: string
    width: number
    height: number
    layers: unknown
    background: string | null
  }
  fieldValues: Record<string, unknown>
  authorName: string
  /** Ver `PersistCreativeInput.canal`. */
  canal?: CanalDaArte | null
  /** Ver `PersistCreativeInput.sourcePageId` — só página-MODELO entra aqui. */
  sourcePageId?: string | null
}

/**
 * Renderiza uma Page já persistida, sobe o PNG e registra a Generation.
 * Miolo comum entre criar uma arte nova (persistAndRenderCreative) e
 * re-renderizar uma existente após ajuste (ajustarArte).
 */
export async function renderPageAndRegister(input: RenderPageInput): Promise<PersistCreativeResult> {
  const { project, templateId, templateName, page } = input

  const designData = convertPageToDesignData({
    id: page.id,
    name: page.name,
    width: page.width,
    height: page.height,
    layers: page.layers,
    background: page.background,
  })

  await registerProjectFonts(project.id)

  const { CanvasRenderer } = await import('@/lib/canvas-renderer')
  const renderer = new CanvasRenderer(designData.canvas.width, designData.canvas.height)
  const buffer = await renderer.renderDesign(designData, {})

  const blobPath = `arte-rapida/${project.id}/${page.id}-${Date.now()}.png`
  const blob = await put(blobPath, buffer, { access: 'public', contentType: 'image/png' })

  await db.page.update({ where: { id: page.id }, data: { thumbnail: blob.url } })

  const generation = await db.generation.create({
    data: {
      status: 'COMPLETED' as any,
      templateId,
      // pageId entra sempre: é como conferir-arte localiza as camadas da arte
      // para o diagnóstico geométrico (sobreposição vs texto faltando).
      fieldValues: { ...input.fieldValues, pageId: page.id, thumbnailUrl: blob.url } as any,
      sourcePageId: input.sourcePageId ?? null,
      resultUrl: blob.url,
      projectId: project.id,
      createdBy: project.userId,
      authorName: input.authorName,
      canal: input.canal ?? null,
      templateName,
      projectName: project.name,
      completedAt: new Date(),
      fileName: `${page.name}.png`,
    },
  })

  const appUrl = getPublicAppUrl()

  return {
    generationId: generation.id,
    pageId: page.id,
    templateId,
    templateName,
    url: blob.url,
    editUrl: `${appUrl}/templates/${templateId}/editor?pageId=${encodeURIComponent(page.id)}`,
    galleryUrl: `${appUrl}/projects/${project.id}?tab=criativos`,
    width: designData.canvas.width,
    height: designData.canvas.height,
    sizeKB: Math.round(buffer.length / 1024),
  }
}
