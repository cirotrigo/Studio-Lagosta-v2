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

import type { CanalDaArte } from './canal'
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
import { registrarDecisaoSemSugestao } from '@/lib/aprendizado/captura'
import { copyDeCamadas, diffDeCopy } from '@/lib/aprendizado/diff-copy'
import { lerCamadas, parsePageLayers } from '@/lib/posts/page-layers'
import {
  caiNaEscolhaPropria,
  fecharDicaDeCopyDaPagina,
} from '@/lib/aprendizado/fechar-copy-por-pagina'
import { fecharSugestaoDeModelo, registrarSugestaoDeModelo } from '@/lib/aprendizado/sinal-de-modelo'
import { fecharSugestaoDeFoto } from '@/lib/aprendizado/sinal-de-foto'
import { registrarUsoDeModelo } from '@/lib/aprendizado/uso-de-modelo'
import { registrarUsoDeFoto } from '@/lib/creatives/uso-de-foto'
import { vigenteEm } from '@/lib/knowledge/vigencia'
import { reflowLayersAfterFill } from '@/lib/combo-stack-reflow'
import { casaDiaComNome, casaTemaComTags } from '@/lib/creatives/casar-tema'
import { createServerTextMeasurer } from '@/lib/creatives/server-text-measurer'
import { aplicarAutofixOuFalhar, type AutofixReport } from '@/lib/creatives/text-autofix'
import {
  aplicarHaloNaArte,
  escolherPaginaPelaFoto,
  lerFotoParaMedicao,
} from '@/lib/creatives/halo/integracao-arte-rapida'
import type { LayoutPelaFoto } from '@/lib/creatives/halo/layout-pela-foto'
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

/**
 * `Page.layers` → camadas, pelo leitor único (`page-layers.ts`), que aceita
 * as três codificações do banco — inclusive a string DUPLA-codificada.
 *
 * Até 02/09/2026 isto decodificava UM nível e devolvia `[]` em silêncio na
 * dupla. Continua devolvendo `[]` no ilegível (é o que `slotFieldsFromLayers`
 * e o diagnóstico de geometria esperam); quem vai PRODUZIR arte a partir das
 * camadas usa `camadasParaBake`, que lança.
 */
export function parseLayers(raw: unknown): any[] {
  return parsePageLayers(raw) as any[]
}

/**
 * As camadas de uma página que vai virar arte. Ilegível LANÇA: assar a copy
 * sobre `[]` produziria uma peça vazia com cara de sucesso.
 */
function camadasParaBake(raw: unknown, page: { id: string; name?: string | null }): any[] {
  const { camadas, legivel } = lerCamadas(raw)
  if (!legivel) {
    throw new CreativeError(
      'PAGE_LAYERS_ILEGIVEIS',
      `A página ${page.name ? `"${page.name}" (${page.id})` : page.id} tem camadas ilegíveis e não pode virar arte. ` +
        'Abra a página no editor e salve de novo para regravar as camadas.',
      422,
      { pageId: page.id },
    )
  }
  return camadas as any[]
}

/** Campos preenchíveis de uma página: textos e imagens dinâmicas. */
export function slotFieldsFromLayers(raw: unknown): SlotField[] {
  return parseLayers(raw)
    .filter((l: any) => l.type === 'text' || (l.type === 'image' && l.isDynamic))
    .map((l: any) => ({
      layerId: l.id,
      name: l.name,
      type: l.type,
      isDynamic: !!l.isDynamic,
      currentValue: l.type === 'text' ? (l.content ?? '') : (l.fileUrl ?? ''),
    }))
}

// ─── prepare-creative ────────────────────────────────────────────────

export interface PrepareCreativeInput {
  /** Project name or substring (e.g., "Tero", "By Rock"). */
  projectHint?: string
  /** Exact project id — skips name matching. Preferred by service callers. */
  projectId?: number
  /**
   * Theme of the creative (e.g., "almoço executivo", "happy hour").
   *
   * Com tema, o casamento é SÓ por tag (`casaTemaComTags`) — tema que não
   * casa com nada é `NO_TEMPLATE_MATCH`, nunca "qualquer página do dia".
   * Sem tema, vale o casamento só por dia (modelos legados sem tag).
   */
  theme?: string
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
    /** Mesmo formato do principal — sem isso a alternativa era escolha às cegas. */
    slotFields: SlotField[]
  }>
  /**
   * Id do sinal de aprendizado que registrou ESTA proposta de modelo (`null`
   * quando havia candidato único — sem alternativa não houve preferência).
   * Devolver a `createArteRapida` fecha o desfecho sem reconciliação; nenhum
   * chamador de hoje faz isso, e por isso o fechamento por reconciliação
   * existe (ver `sinal-de-modelo.ts`).
   */
  sugestaoId?: string | null
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

  /**
   * Casamento por TEMA, só por tag — ver `casar-tema.ts` para as regras.
   *
   * 🔴 Não existe mais fallback "só-dia" quando o tema foi informado. Havia
   * um, e foi ele que fez `escolher-modelo("funcionamento")` devolver
   * "Celebrações Especiais" no O Quintal Parrilla (01/09/2026): sem modelo
   * de funcionamento, o dia "quinta" casava por substring com "QUINTAl" no
   * nome de TODO template do cliente, e a primeira página vencia. Tema que
   * não casa é erro com sugestão — a saída certa é criar a arte por IA ou
   * cadastrar um modelo, nunca entregar um modelo de outro assunto.
   *
   * O casamento só por dia continua valendo APENAS quando o chamador não
   * passou tema (modelos legados que codificam o dia no nome).
   */
  const theme = input.theme?.trim() ?? ''
  const dayMatch = (p: any) => casaDiaComNome(p.name, input.day!) || casaDiaComNome(p.templateName, input.day!)

  let candidates: any[]
  if (theme) {
    const themeMatches = allPages.filter((p: any) =>
      casaTemaComTags(theme, [...(p.tags ?? []), ...(p.templateTags ?? [])]),
    )
    candidates = themeMatches
    // O dia só DESEMPATA entre os modelos do tema; nunca amplia a lista.
    if (input.day) {
      const dayMatches = themeMatches.filter(dayMatch)
      if (dayMatches.length > 0) candidates = dayMatches
    }
  } else if (input.day) {
    candidates = allPages.filter(dayMatch)
  } else {
    candidates = []
  }

  if (candidates.length === 0) {
    const availableTags = Array.from(
      new Set(allPages.flatMap((p: any) => [...(p.tags ?? []), ...(p.templateTags ?? [])])),
    ).slice(0, 30)
    const availableTemplates = Array.from(new Set(allPages.map((p: any) => p.templateName)))
    const criterio = theme
      ? `theme "${theme}"${input.day ? ` and day "${input.day}"` : ''}`
      : input.day
        ? `day "${input.day}" (no theme given)`
        : 'no theme and no day'
    throw new CreativeError(
      'NO_TEMPLATE_MATCH',
      `No template page found for ${criterio} in project "${project.name}".`,
      404,
      {
        project: { id: project.id, name: project.name },
        availableTags,
        availableTemplates,
        suggestion: theme
          ? `Não há modelo para o tema "${theme}" neste cliente. Crie a arte por IA (criar-arte) ou cadastre um modelo com a tag do tema (marcar-como-modelo / --projeto no gerador). Não use um modelo de outro tema — as tags disponíveis estão em availableTags.`
          : 'Informe um tema (theme) para casar por tag, ou um dia que exista no nome de um modelo legado — as tags disponíveis estão em availableTags.',
      },
    )
  }

  const bestRef = candidates[0]
  const altRefs = candidates.slice(1, 5)
  const altLayers = altRefs.length
    ? await db.page.findMany({
        where: { id: { in: altRefs.map((p: any) => p.id) } },
        select: { id: true, layers: true },
      })
    : []
  const altSlotsById = new Map(altLayers.map((p) => [p.id, slotFieldsFromLayers(p.layers)]))
  const alternatives = altRefs.map((p: any) => ({
    id: p.id,
    name: p.name,
    templateId: p.templateId,
    templateName: p.templateName,
    tags: p.tags ?? [],
    templateTags: p.templateTags ?? [],
    slotFields: altSlotsById.get(p.id) ?? [],
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

  const slotFields: SlotField[] = slotFieldsFromLayers(page.layers)

  /**
   * O ÚNICO ponto que enxerga os modelos rejeitados. Daqui para a frente a
   * lista some: quem cria a arte recebe só `sourcePageId`, e o que não foi
   * escolhido nunca mais é mencionado. Registrado no momento da EMISSÃO, não
   * na aceitação — proposta ignorada que não vira linha faz a taxa de
   * aceitação valer 100% por construção.
   *
   * Os candidatos gravados são os OFERECIDOS (principal + alternativas), não
   * todos os que o casamento por tema encontrou: registrar como proposto algo
   * que ninguém viu inventaria uma rejeição que não houve.
   */
  const sugestaoId = await registrarSugestaoDeModelo({
    projectId: project.id,
    tema: theme || (input.day ?? ''),
    dia: input.day ?? null,
    candidatos: [bestRef.id, ...altRefs.map((p: any) => p.id)],
    escolhido: bestRef.id,
  })

  const kbEntries = await db.knowledgeBaseEntry.findMany({
    where: {
      projectId: project.id,
      status: 'ACTIVE',
      // Arte rápida é para AGORA: campanha vencida aqui vira texto que promete
      // uma promoção que já acabou.
      ...vigenteEm(),
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
    sugestaoId,
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
   * an object may carry `content`, `fileUrl` and/or `hidden: true` (a camada
   * sai invisível — é como o plano esconde campo de texto que a copy não
   * cobriu). Two reserved keys: `_driveImageId` (Google Drive file) and
   * `_imageUrl` (direct URL).
   */
  slotValues: Record<string, unknown>
  /** Name for the generated page (default: "<source name> — <timestamp>"). */
  name?: string
  /** Direct image URL, e.g. a Supabase/Blob upload. Wins over _driveImageId. */
  imageUrl?: string
  /**
   * Sinal de aprendizado que propôs este modelo (`prepareCreative().sugestaoId`).
   * Sem ele o desfecho é atribuído por reconciliação — ver `sinal-de-modelo.ts`.
   */
  sugestaoId?: string | null
  /**
   * A foto que o CARD do item de plano mostrava quando a pessoa mandou
   * produzir (F3.4). Igual à foto usada, o sinal de foto fecha como
   * `aceita-como-veio` mesmo fora do topo da busca — quem desceu na lista foi
   * o sistema (não repetir foto na leva), não quem decidiu.
   */
  fotoDoCard?: string | null
  /** Quem decidiu — `User.id` INTERNO (cuid), NUNCA o clerkId. É auditoria. */
  decididoPor?: string | null
  /** Por qual canal a arte entrou (Claudinho, Claude.ai, Claude Code, Studio). Ver `canal.ts`. */
  canal?: CanalDaArte | null
  /** Quem assina a Generation (User.id interno); sem isso, o dono do projeto. */
  createdBy?: string | null
  /**
   * Não trocar o layout pela foto. Por padrão, num template "(3 layouts)" a
   * foto escolhe entre os irmãos (Topo/Rodapé/Dividido) pela faixa mais calma
   * — ver `halo/layout-pela-foto.ts`. Com `true`, a página pedida é a usada.
   */
  layoutFixo?: boolean
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
  /** Relatório da autocorreção geométrica de texto (sempre presente). */
  autocorrecao: AutofixReport
  /** Problemas geométricos não corrigidos (flag desligada ou área segura). */
  avisos?: string[]
  /**
   * O halo no lugar do véu (família de modelos gerados). `aplicado: false`
   * significa que a arte saiu com o véu — o motivo está em `avisos`.
   */
  halo?: { aplicado: boolean; blocos: number; avisos: string[] }
  /** Quando a foto escolheu outro irmão do template "(3 layouts)". */
  layoutEscolhido?: { layout: LayoutPelaFoto; motivo: string; pageId: string; pageName: string }
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
      // O render pula `visible === false` — e o editor mostra a camada como
      // oculta, então quem abrir a arte consegue religá-la.
      if (slotObj.hidden === true) updated.visible = false
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

  /**
   * A foto decide o layout (família "(3 layouts)"): entre os irmãos do
   * template, o texto pousa na faixa mais calma da foto. A foto é lida UMA
   * vez aqui e reaproveitada pelo halo, mais abaixo. Sem foto, sem irmãos ou
   * com `layoutFixo`, a página pedida é a usada — e nada disto lança.
   */
  const canvasDaPeca = { width: sourcePage.width, height: sourcePage.height }
  const fotoLida = await lerFotoParaMedicao(resolved.url, canvasDaPeca)
  const escolha = input.layoutFixo
    ? null
    : await escolherPaginaPelaFoto({
        templateId: sourcePage.Template.id,
        templateNome: sourcePage.Template.name,
        paginaAtual: { id: sourcePage.id, name: sourcePage.name },
        foto: fotoLida,
      })
  const paginaModelo = escolha?.pagina
    ? await db.page.findUnique({ where: { id: escolha.pagina.id }, include: { Template: true } })
    : null
  const modelo = paginaModelo ?? sourcePage
  const layoutEscolhido =
    escolha && paginaModelo
      ? { layout: escolha.layout, motivo: escolha.motivo, pageId: paginaModelo.id, pageName: paginaModelo.name }
      : undefined

  const { layers: bakedLayers, imageApplied, changedTextIds } = bakeLayers(
    camadasParaBake(modelo.layers, modelo),
    slotValues,
    resolved.url,
  )

  // Texto novo maior (ou menor) que o do template: medir a quebra real e
  // reacomodar as pilhas de combinação; texto solto cresce a própria caixa
  // (autoExpand) em vez de truncar. Fontes registradas ANTES de medir.
  await registerProjectFonts(projectId)
  const measure = await createServerTextMeasurer()
  const reflowed = reflowLayersAfterFill(bakedLayers as Layer[], changedTextIds, measure)

  // Validação geométrica + escada de correção — o reflow cresce caixa sem
  // olhar vizinho, e é aqui que colisão/overflow são resolvidos ou barrados.
  const fix = await aplicarAutofixOuFalhar({
    projectId,
    layers: reflowed,
    canvas: canvasDaPeca,
    changedLayerIds: changedTextIds,
    sourceTemplateId: modelo.Template.id,
  })

  /**
   * Halo em vez de véu, DEPOIS do autofix (as caixas de texto já são as
   * finais) e ANTES de persistir (as camadas gravadas são as renderizadas).
   * Só na família de modelos gerados / página com véu; falha na foto cai no
   * véu como está e vira aviso — nunca derruba a criação.
   */
  const halo = await aplicarHaloNaArte({
    projectId,
    layers: fix.layers as Layer[],
    canvas: canvasDaPeca,
    templateTags: modelo.Template.tags,
    fotoLida,
  })
  const layers = halo.layers

  const imageWarning =
    resolved.warning ??
    (resolved.url && !imageApplied
      ? 'A imagem foi resolvida mas o template não tem camada de imagem dinâmica para recebê-la'
      : undefined)

  const pageName = input.name ?? `${modelo.name} — ${new Date().toLocaleString('pt-BR')}`

  const persisted = await persistAndRenderCreative({
    project,
    templateId: arteTemplate.id,
    templateName: arteTemplate.name,
    pageName,
    width: modelo.width,
    height: modelo.height,
    layers,
    background: modelo.background,
    authorName: 'arte-rapida',
    canal: input.canal ?? null,
    createdBy: input.createdBy ?? null,
    // Espelho colunar do `fieldValues.sourcePageId`: aqui ele aponta para um
    // MODELO de verdade, e é a coluna indexada que tira "qual modelo este
    // cliente mais usa" da varredura de Json.
    sourcePageId: modelo.id,
    fieldValues: {
      source: 'arte-rapida',
      sourceTemplateId: modelo.Template.id,
      sourceTemplateName: modelo.Template.name,
      sourcePageId: modelo.id,
      sourcePageName: modelo.name,
      sourceTags: modelo.tags ?? [],
      driveImageId,
      imageUrl: resolved.url ?? directUrl ?? null,
      slotValues,
      autocorrecao: fix.autocorrecao,
      halo: {
        aplicado: halo.aplicado,
        blocos: halo.blocos,
        corDaMancha: halo.corDaMancha,
        avisos: halo.avisos,
        halos: halo.halos.map((h) => ({
          camadaId: h.camadaId,
          camadas: h.camadas,
          tinta: h.tinta,
          raio: h.raio,
          alvo: Math.round(h.alvo),
          luzMedida: Math.round(h.luzMedida),
          noTeto: h.noTeto,
        })),
      },
      ...(layoutEscolhido
        ? { layoutEscolhido: { ...layoutEscolhido, pedido: { pageId: sourcePage.id, pageName: sourcePage.name } } }
        : {}),
    },
  })

  /**
   * A decisão de modelo, agora que ela existe de fato.
   *
   * Depois de persistir, de propósito: contar uso de uma arte que falhou ao
   * renderizar mentiria sobre a preferência do cliente. Nenhuma das duas
   * chamadas lança — se o registro falhar, a arte já está pronta e é dela que
   * alguém precisa.
   */
  await registrarUsoDeModelo(modelo.id)
  await fecharSugestaoDeModelo({
    projectId,
    pageIdUsado: modelo.id,
    generationId: persisted.generationId,
    sugestaoId: input.sugestaoId ?? null,
    decididoPor: input.decididoPor ?? null,
    superficie: 'chat',
  })
  /**
   * E a foto: `buscarNoAcervo` propôs uma lista, esta arte consumiu uma delas.
   * Sem isto a proposta ficava pendente até expirar — registrando "ninguém
   * decidiu" sobre a foto que virou arte. Ver `sinal-de-foto.ts`.
   */
  if (driveImageId) {
    // Rodízio do acervo (B5): esta foto acaba de virar arte.
    await registrarUsoDeFoto({
      projectId,
      driveFileIds: [driveImageId],
      origem: 'arte-rapida',
      // `name` é o rótulo da peça — o mais próximo de "assunto" que este
      // caminho tem; `slotValues` é chaveado por camada, não por papel.
      tema: input.name ?? null,
      generationId: persisted.generationId,
    })
    await fecharSugestaoDeFoto({
      projectId,
      driveFileIdUsado: driveImageId,
      fotoDoCard: input.fotoDoCard ?? null,
      generationId: persisted.generationId,
      pageId: persisted.pageId,
      decididoPor: input.decididoPor ?? null,
      superficie: 'chat',
    })
  }

  return {
    created: true,
    ...persisted,
    templateName: ARTE_RAPIDA_TEMPLATE_NAME,
    imageApplied,
    ...(imageWarning ? { imageWarning } : {}),
    autocorrecao: fix.autocorrecao,
    ...(fix.avisos.length > 0 ? { avisos: fix.avisos } : {}),
    halo: { aplicado: halo.aplicado, blocos: halo.blocos, avisos: halo.avisos },
    ...(layoutEscolhido ? { layoutEscolhido } : {}),
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
  /** Quem decidiu — `User.id` INTERNO (cuid), NUNCA o clerkId. É auditoria. */
  decididoPor?: string | null
  /** Ver `CreateArteRapidaInput.canal`. */
  canal?: CanalDaArte | null
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
  /**
   * Posts que o ajuste NÃO alcança: já foram entregues ao publicador e vão ao
   * ar com a arte anterior. O chat precisa dizer isso — deixar passar em
   * silêncio é o bug que a janela de congelamento veio corrigir.
   */
  postsCongelados?: number
  /** Relatório da autocorreção geométrica de texto (sempre presente). */
  autocorrecao: AutofixReport
  avisos?: string[]
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

  /**
   * A copy ANTES do ajuste, lida do jeito profundo (`page-layers.ts`). Num
   * diff de aprendizado, camadas lidas como `[]` virariam "não havia texto
   * antes", e toda linha da arte apareceria como ACRESCENTADA pela pessoa —
   * o diff falsamente vazio, ao contrário. `null` = ilegível, e ilegível não
   * vira sinal.
   */
  const copyAntes = copyDeCamadas(page.layers)

  const sourceLayers = camadasParaBake(page.layers, page)
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
  const reflowed = reflowLayersAfterFill(bakedLayers as Layer[], changedTextIds, measure)

  const fix = await aplicarAutofixOuFalhar({
    projectId,
    layers: reflowed,
    canvas: { width: page.width, height: page.height },
    changedLayerIds: changedTextIds,
  })
  const layers = fix.layers

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
    canal: input.canal ?? null,
    fieldValues: {
      source: 'ajuste-arte',
      sourcePageId: page.id,
      ajustes: slotValues,
      slotValues: slotValuesFinais,
      driveImageId,
      imageUrl: resolved.url ?? directUrl ?? null,
      autocorrecao: fix.autocorrecao,
    },
  })

  // Page.layers mudou: posts da agenda que usam esta página precisam voltar à
  // fila de render, senão publicam a arte antiga em silêncio.
  const invalidacao = await invalidateScheduledRenders(db, { pageIds: [page.id] })
  const postsInvalidados = invalidacao.invalidados

  /**
   * O outro lado da invalidação: a arte CONGELADA desta página — o slide de
   * carrossel, que é `NOT_NEEDED` e fica FORA do alcance do re-render. Sem
   * isto, ajustar a arte de um slide não mudava nada no post. Ver
   * `recompor.ts`.
   */
  const { pedirRecomposicaoDaArteCongelada } = await import('@/lib/compositor/recompor')
  await pedirRecomposicaoDaArteCongelada([page.id])

  /**
   * A CORREÇÃO EXPLÍCITA — o sinal mais limpo que existe aqui.
   *
   * `fieldValues.ajustes` já guardava "onde a IA errou", mas só como texto
   * solto num Json sem índice. O que entra no corpus é o par completo: a copy
   * que estava e a que ficou, com o diff campo a campo.
   *
   * ── DOIS CAMINHOS, E O QUE OS SEPARA ────────────────────────────────────
   * Depende de a copy ter sido PROPOSTA antes:
   *
   *  · **veio de um item de plano com dica** (`propor-semana` registrou a copy
   *    como sugestão emitida) → o que se grava é o DESFECHO daquela proposta.
   *    Abrir uma linha nova aqui faria o mesmo texto virar dois sinais com
   *    sentidos opostos, inflando o denominador do KPI — o defeito que a F1 já
   *    teve de corrigir uma vez no slot (`e3236624`);
   *
   *  · **não veio** → segue valendo `registrarDecisaoSemSugestao`, pelo motivo
   *    de sempre: a copy foi escrita pelo LLM na conversa e chegou pronta em
   *    `createArteRapida`, sem nunca ter sido registrada como proposta. Chamar
   *    isto de "sugestão recusada" inventaria um denominador que não existe — e
   *    é para este caso que a decisão absoluta carrega um `diff`.
   *
   * O desfecho é CALCULADO comparando o texto proposto com o final; nada aqui
   * declara acerto. E só `sem-plano` cai na escolha absoluta
   * (`caiNaEscolhaPropria`): em `erro` não dá para saber se havia dica, e
   * perder um sinal é mais barato que gravar a linha paralela.
   *
   * Sem mudança de texto (ajuste só de foto ou de nome) não há sinal de copy:
   * gravar linha vazia só diluiria o corpus.
   */
  const copyDepois = copyDeCamadas(layers)
  const diffDaCorrecao = diffDeCopy(copyAntes, copyDepois)
  if (!diffDaCorrecao.ilegivel && diffDaCorrecao.mudou) {
    const fechamento = await fecharDicaDeCopyDaPagina({
      projectId,
      pageId: page.id,
      generationId: persisted.generationId,
      copyFinal: copyDepois,
      decididoPor: input.decididoPor ?? null,
      superficie: 'chat',
    })
    if (caiNaEscolhaPropria(fechamento)) {
      await registrarDecisaoSemSugestao({
        projectId,
        tipo: 'copy',
        escolhido: { copy: copyDepois, trocouFoto: imageApplied },
        diff: diffDaCorrecao,
        pageId: page.id,
        generationId: persisted.generationId,
        decididoPor: input.decididoPor ?? null,
        superficie: 'chat',
        // A Generation é criada por ajuste; retry que devolva a mesma não duplica.
        chave: `copy:ajuste:${persisted.generationId}`,
      })
    }
  }

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
    ...(invalidacao.congelados.length > 0
      ? { postsCongelados: invalidacao.congelados.length }
      : {}),
    autocorrecao: fix.autocorrecao,
    ...(fix.avisos.length > 0 ? { avisos: fix.avisos } : {}),
  }
}
