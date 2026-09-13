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

import { copyVisualDasCamadas } from '@/lib/creatives/procedencia-da-copy'
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
import { copyParaDecisao, diffDeCopy } from '@/lib/aprendizado/diff-copy'
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
import { problemaDoAjuste, type Ajuste } from '@/lib/creatives/revisao/contrato'
import { aplicarAjustes, type AjusteAplicado, type AjusteRecusado } from '@/lib/creatives/revisao/aplicar-ajustes'
import { versaoDaPagina } from '@/lib/creatives/revisao/versao'
import { semMarcaDoRevisor } from '@/lib/creatives/revisao/oculta-pelo-revisor'

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
      // oculta, então quem abrir a arte consegue religá-la. `hidden: true` é
      // instrução HUMANA explícita: uma marca antiga de "escondida pelo
      // revisor" não pode encobri-la (REV-8AD-02).
      if (slotObj.hidden === true) Object.assign(updated, semMarcaDoRevisor({ ...updated, visible: false }))
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
  /**
   * Ajustes de diagramação (os que `revisar-arte` devolve): corpo, entrelinha,
   * posição, gradiente de leitura, visibilidade, caixa. Aplicados DEPOIS dos
   * textos e da foto, antes do autofix — ver `revisao/aplicar-ajustes.ts`.
   */
  ajustes?: Ajuste[]
  /** A `versao` da revisão: página que mudou desde então recusa o ajuste (VERSAO_DIVERGENTE). */
  versaoEsperada?: string | null
  /** Só para a prova de integração: costura que roda DENTRO da transação, entre a escrita da página e a trava. */
  _prova?: {
    entreGravarETravar?: () => Promise<void>
    /**
     * Depois de o PNG deste ajuste subir ao Blob e antes da publicação condicionada pela versão (REV-FINAL-01). Recebe
     * a URL do PNG: a prova a registra para a limpeza antes de tudo (REV-90AA-01).
     */
    antesDePublicar?: (png: { url: string }) => Promise<void>
  }
}

export interface AjustarArteResult {
  ajustada: true
  /** A versão da página depois deste ajuste — a próxima revisão parte dela. */
  versao?: string | null
  ajustesAplicados?: AjusteAplicado[]
  ajustesRecusados?: AjusteRecusado[]
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

  const ajustes = input.ajustes ?? []
  const temAjuste =
    Object.keys(slotValues).length > 0 || input.imageUrl || input.driveImageId || input.name || ajustes.length > 0
  if (!temAjuste) {
    throw new CreativeError(
      'SEM_AJUSTE',
      'Nada para ajustar: envie slotValues, imageUrl/driveImageId, name ou ajustes.',
      400,
    )
  }
  const ajustesIncompletos = ajustes
    .map((a, i) => {
      const problema = problemaDoAjuste(a)
      return problema ? `ajuste ${i}: ${problema}` : null
    })
    .filter((p): p is string => !!p)
  if (ajustesIncompletos.length > 0) {
    throw new CreativeError('AJUSTE_INVALIDO', `Ajustes incompletos — ${ajustesIncompletos.join('; ')}.`, 400)
  }
  // Ajuste CALCULADO (pelo revisor) só se aplica sobre a versão em que foi
  // calculado: sem `versaoEsperada` os deltas iriam para o lugar errado se a
  // página tivesse mudado. Chamada sem `ajustes` (texto, foto, nome) continua
  // como sempre foi.
  if (ajustes.length > 0 && !input.versaoEsperada) {
    throw new CreativeError(
      'VERSAO_OBRIGATORIA',
      'Ajustes de diagramação exigem `versaoEsperada` — a `versao` que revisar-arte devolveu. Rode revisar-arte e mande a versão junto.',
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

  // A revisão calcula os ajustes sobre UMA versão da página: se ela mudou (a
  // equipe editou, outro ajuste já entrou), os deltas iriam para o lugar errado.
  const versaoAntes = versaoDaPagina(page)
  if (input.versaoEsperada && versaoAntes !== input.versaoEsperada) {
    throw new CreativeError(
      'VERSAO_DIVERGENTE',
      'A página mudou desde a revisão (alguém editou ou outro ajuste já entrou). Rode revisar-arte de novo e use a versão nova.',
      409,
      { versaoEsperada: input.versaoEsperada, versaoAtual: versaoAntes },
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
  // Lado do APRENDIZADO: a camada escondida por ajuste anterior do revisor conta como presente (REV-9E-01).
  const copyAntes = copyParaDecisao(page.layers)

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
  // Com ajustes do revisor e nenhum texto trocado, não há preenchimento para
  // refluir: normalizar a pilha antes deslocaria a base do grupo que o executor
  // precisa preservar. Sem ajustes, o comportamento de sempre.
  const reflowed =
    changedTextIds.length > 0 || ajustes.length === 0
      ? reflowLayersAfterFill(bakedLayers as Layer[], changedTextIds, measure)
      : (bakedLayers as Layer[])

  const revisao =
    ajustes.length > 0
      ? aplicarAjustes(reflowed, ajustes, { canvas: { width: page.width, height: page.height }, medir: measure })
      : null
  if (revisao && revisao.aplicados.length === 0 && Object.keys(slotValues).length === 0 && !resolved.url && !input.name) {
    throw new CreativeError(
      'AJUSTE_SEM_EFEITO',
      `Nenhum ajuste pôde ser aplicado — ${revisao.recusados.map((r) => `ajuste ${r.indice}: ${r.motivo}`).join('; ')}.`,
      422,
      { recusados: revisao.recusados },
    )
  }

  const fix = await aplicarAutofixOuFalhar({
    projectId,
    layers: revisao?.camadas ?? reflowed,
    canvas: { width: page.width, height: page.height },
    changedLayerIds: [...changedTextIds, ...(revisao?.alteradas ?? [])],
  })
  const layers = fix.layers

  const imageWarning =
    resolved.warning ??
    (resolved.url && !imageApplied
      ? 'A imagem foi resolvida mas a arte não tem camada de imagem dinâmica para recebê-la'
      : undefined)

  const pageName = input.name ?? page.name
  /**
   * A miniatura da página é INVALIDADA junto das camadas (REV-127-F01 da
   * revisão FINAL do Codex, 12/09/2026): ela é o PNG do render ANTERIOR, e
   * `agendarPost` a reutiliza como mídia quando a página ainda não tem post —
   * se o render abaixo falhar, o post nasceria RENDERED com a versão velha e
   * fora do cron de renders pendentes (a invalidação não acha post nenhum e a
   * recuperação sai sem slide). Nula, o agendamento nasce PENDING e o cron
   * desenha a página ajustada; o render bem-sucedido a regrava.
   */
  const dadosDaPagina = { layers: layers as any, thumbnail: null as string | null, ...(input.name ? { name: input.name } : {}) }
  /**
   * A página passa a carregar o ajuste do revisor; a arte do compositor (spec
   * e snapshot) não o conhece. Se o render abaixo e todas as recuperações
   * falharem, a próxima edição de texto reabriria o job NORMAL e a
   * recomposição refaria a peça pela spec antiga, desfazendo o ajuste. A
   * trava (`somenteReRender`) nasce junto da gravação do ajuste — não do
   * desfecho do render (REV-F01) — e NA MESMA TRANSAÇÃO: fora dela um worker
   * podia ler a página já ajustada com a arte ainda sem trava e recompor por
   * cima (REV-D01 da revisão do Codex, 12/09/2026). Se a trava falhar, a
   * página não é gravada: ajuste sem proteção é ajuste que a fila desfaz.
   */
  const travar = !!revisao && revisao.aplicados.length > 0
  const { travarRecomposicaoDaArte } = travar ? await import('@/lib/compositor/recompor') : { travarRecomposicaoDaArte: null }
  await db.$transaction(
    async (tx) => {
      if (input.versaoEsperada) {
        // Compare-and-set: a conferência de versão lá em cima e esta escrita
        // não são atômicas, e o autosave do editor pode cair no meio.
        const gravada = await tx.page.updateMany({ where: { id: page.id, updatedAt: page.updatedAt }, data: dadosDaPagina })
        if (gravada.count === 0) {
          throw new CreativeError(
            'VERSAO_DIVERGENTE',
            'A página mudou enquanto o ajuste era aplicado. Rode revisar-arte de novo.',
            409,
            { versaoEsperada: input.versaoEsperada },
          )
        }
      } else {
        await tx.page.update({ where: { id: page.id }, data: dadosDaPagina })
      }
      if (travarRecomposicaoDaArte) {
        if (input._prova?.entreGravarETravar) await input._prova.entreGravarETravar()
        await travarRecomposicaoDaArte(page.id, 'ajuste do revisor gravado na página', { projectId: input.projectId, client: tx })
      }
    },
    { maxWait: 10_000, timeout: 20_000 },
  )

  // Textos FINAIS da arte, por nome de camada — é o que alimenta a verificação
  // por visão do conferir-arte e do melhorar-arte (extractExpectedTexts lê
  // slotValues), então precisa refletir a página como ficou, não só o patch.
  // Rich text é copy (o executor dos ajustes mexe nele), e camada escondida não
  // aparece na arte — exigi-la na conferência reprovaria a peça certa.
  // `layers` aqui é a lista em memória, já decodificada: nunca ilegível.
  const slotValuesFinais = copyVisualDasCamadas(layers) ?? {}

  const avisarAgenda = async (opcoes: { renderFalhou?: boolean } = {}) => {
    // Page.layers mudou: posts da agenda que usam esta página precisam voltar à
    // fila de render, senão publicam a arte antiga em silêncio.
    const resultado = await invalidateScheduledRenders(db, { pageIds: [page.id] })
    /**
     * O outro lado da invalidação: a arte CONGELADA desta página — o slide de
     * carrossel, que é `NOT_NEEDED` e fica FORA do alcance do re-render. Sem
     * isto, ajustar a arte de um slide não mudava nada no post. Ver
     * `recompor.ts`. Quando o render FALHOU não há Generation nova para a URL
     * denunciar a defasagem, e um ajuste só de força do gradiente nem aparece
     * no diff geométrico: a recomposição é FORÇADA.
     */
    const { pedirRecomposicaoDaArteCongelada } = await import('@/lib/compositor/recompor')
    await pedirRecomposicaoDaArteCongelada([page.id], 'editor', { forcar: opcoes.renderFalhou === true })
    return resultado
  }

  /**
   * A versão que ESTE ajuste gravou e que o render abaixo desenha. A miniatura
   * e a Generation só são publicadas se a página ainda estiver nela
   * (REV-FINAL-01 da revisão FINAL do Codex sobre 618e45f7, 12/09/2026): a
   * proteção de versão acima cobre a escrita das CAMADAS, e o render de A que
   * terminava depois do ajuste B (que leu a versão de A e já publicou a sua)
   * regravava a miniatura e virava a Generation mais recente com a versão
   * velha — o agendamento seguinte pela página nascia RENDERED com ela.
   */
  const versaoGravada = versaoDaPagina({ width: page.width, height: page.height, background: page.background, layers })

  // A página JÁ foi gravada: se o render falhar (Blob fora do ar), a invalidação
  // e a recomposição acontecem do mesmo jeito — senão a agenda segue com a arte
  // antiga e o retry com a versão anterior toma VERSAO_DIVERGENTE.
  let persisted: Awaited<ReturnType<typeof renderPageAndRegister>>
  try {
    persisted = await renderPageAndRegister({
      versaoEsperada: versaoGravada,
      antesDePublicar: input._prova?.antesDePublicar,
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
        ...(revisao
          ? { revisao: { versaoAntes, ajustes, aplicados: revisao.aplicados, recusados: revisao.recusados } }
          : {}),
        slotValues: slotValuesFinais,
        // A copy como o APRENDIZADO a lê (a camada escondida pelo revisor conta): é o lado "antes" do diff no
        // agendamento — os `slotValues` visuais acima acusariam essa camada como ADICIONADA (REV-8AD-01).
        copyDeAprendizado: copyParaDecisao(layers) ?? undefined,
        driveImageId,
        imageUrl: resolved.url ?? directUrl ?? null,
        autocorrecao: fix.autocorrecao,
      },
    })
  } catch (erro) {
    await avisarAgenda({ renderFalhou: true }).catch((falha) => console.warn('[ajustar-arte] invalidação depois da falha do render:', falha))
    if (erro instanceof CreativeError && erro.code === 'PAGINA_MUDOU_DURANTE') {
      // O render desta versão foi DESCARTADO (a página já está na seguinte): o ajuste está gravado, a arte não.
      throw new CreativeError(
        'PAGINA_MUDOU_DURANTE',
        'O ajuste foi gravado na página, mas ela mudou de novo enquanto a arte era renderizada (outro ajuste ou uma edição): a arte desta versão foi descartada — não virou miniatura nem entrou na galeria. A versão atual da página é a que vale; rode revisar-arte de novo sobre ela.',
        409,
        { ...(erro.details ?? {}), ajusteGravado: true },
      )
    }
    throw erro
  }

  const invalidacao = await avisarAgenda()
  const postsInvalidados = invalidacao.invalidados

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
  // Com ajustes do revisor, a copy da DECISÃO é a de antes deles: esconder uma
  // camada por ajuste mecânico não é a pessoa apagando o texto.
  const copyDepois = copyParaDecisao(revisao ? reflowed : layers)
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
    versao: versaoGravada,
    ...(revisao ? { ajustesAplicados: revisao.aplicados, ajustesRecusados: revisao.recusados } : {}),
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
