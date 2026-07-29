/**
 * Arte livre — criativo montado do zero, sem página de modelo.
 *
 * Aqui quem decide o layout é o modelo que está conversando com o usuário: ele
 * escolhe o fundo, o texto e onde cada bloco fica. Duas formas de compor:
 *
 *  - `combinationId` — usa uma combinação tipográfica do projeto. Posição,
 *    tamanho, cor e efeitos vêm prontos e coerentes com a marca; o modelo só
 *    troca os textos. É o caminho recomendado.
 *  - `textos[]` — o modelo posiciona cada bloco por conta própria, em
 *    coordenadas relativas ao canvas (0..1), herdando as fontes da marca.
 *
 * O resultado é uma página editável no editor de templates, igual à do
 * arte-rápida.
 */

import { db } from '@/lib/db'
import { createId } from '@/lib/id'
import { CreativeError } from '@/lib/creatives/errors'
import {
  ensureArteTemplate,
  FORMAT_PRESETS,
  inferTemplateType,
  persistAndRenderCreative,
  resolveImageUrl,
  type FormatoArte,
} from '@/lib/creatives/persist'
import { buildComboLayers } from '@/lib/font-combinations-layers'
import { applyStackPatches, reflowComboStack } from '@/lib/combo-stack-reflow'
import { createServerTextMeasurer } from '@/lib/creatives/server-text-measurer'
import { registerProjectFonts } from '@/lib/posts/register-project-fonts'
import {
  FONT_COMBO_LAYOUTS,
  resolveComboFontFamily,
  type FontComboPair,
} from '@/lib/font-combinations'
import { FONT_CONFIG } from '@/lib/font-config'
import type { Layer } from '@/types/template'

/** Sombra suave aplicada por padrão a texto solto sobre foto, para não sumir. */
const SOMBRA_LEGIBILIDADE = {
  enabled: true,
  shadowColor: '#000000',
  shadowBlur: 24,
  shadowOffsetX: 0,
  shadowOffsetY: 4,
  shadowOpacity: 0.55,
}

export interface TextoLivre {
  /** Conteúdo do bloco. Quebras de linha com \n são respeitadas. */
  texto: string
  /** Canto superior esquerdo, relativo ao canvas (0..1) */
  x: number
  y: number
  /** Largura da caixa, fração do canvas (0..1) */
  width: number
  /** Corpo do texto em px na base de 1080 de largura */
  fontSize: number
  /** De qual fonte da marca herda a família (default 'body') */
  role?: 'title' | 'subtitle' | 'body'
  /** Família específica; sobrepõe o role */
  fontFamily?: string
  fontWeight?: string
  fontStyle?: 'normal' | 'italic'
  textTransform?: 'none' | 'uppercase'
  textAlign?: 'left' | 'center' | 'right'
  lineHeight?: number
  letterSpacing?: number
  color?: string
  /** Sombra de legibilidade. Default true quando há foto de fundo. */
  sombra?: boolean
}

export type OverlayArte = 'nenhum' | 'inferior' | 'superior' | 'completo'

export interface CreateArteLivreInput {
  projectId: number
  /** story 1080x1920 (default), feed 1080x1350, quadrado 1080x1080 */
  formato?: FormatoArte
  /** Dimensões custom; sobrepõem o formato */
  width?: number
  height?: number
  /** Fundo: foto por URL, foto do Drive ou cor sólida */
  imageUrl?: string
  driveImageId?: string
  backgroundColor?: string
  /** Escurecimento sobre a foto para o texto respirar (default 'inferior' com foto) */
  overlay?: OverlayArte
  /** Combinação tipográfica do projeto (ver listFontCombinations) */
  combinationId?: string
  /** Textos da combinação, por id ou label do elemento */
  textos?: Record<string, string>
  /** Blocos posicionados pelo modelo (alternativa à combinação) */
  textosLivres?: TextoLivre[]
  /** Inclui o logo do projeto (default true) */
  logo?: boolean
  name?: string
}

export interface CreateArteLivreResult {
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
  /** Como o texto foi composto, para o chamador conferir */
  composicao: 'combinacao' | 'livre'
  combinacaoUsada?: string
  camadasDeTexto: number
  imageWarning?: string
  /** Avisa quando a marca não tem par de fontes definido e houve escolha automática */
  avisoFontes?: string
  /** Lembra o assistente do passo seguinte, para a arte não ficar órfã */
  proximoPasso: string
}

/** Gradiente de escurecimento, para o texto continuar legível sobre a foto. */
function buildOverlayLayer(overlay: OverlayArte, width: number, height: number, order: number): Layer | null {
  if (overlay === 'nenhum') return null

  // Ângulo na convenção do renderer: 0° = base→topo, 180° = topo→base.
  // O primeiro stop é o transparente, então ele precisa cair na borda que
  // encosta na foto limpa — senão aparece um corte reto no meio da arte.
  const presets: Record<Exclude<OverlayArte, 'nenhum'>, { y: number; h: number; angle: number }> = {
    inferior: { y: 0.45, h: 0.55, angle: 180 },
    superior: { y: 0, h: 0.45, angle: 0 },
    completo: { y: 0, h: 1, angle: 180 },
  }
  const preset = presets[overlay]

  return {
    id: createId(),
    type: 'gradient',
    name: `Sombreado (${overlay})`,
    visible: true,
    locked: false,
    order,
    position: { x: 0, y: Math.round(preset.y * height) },
    size: { width, height: Math.round(preset.h * height) },
    style: {
      gradientType: 'linear',
      gradientAngle: preset.angle,
      gradientStops: [
        { id: '1', color: '#000000', position: 0, opacity: overlay === 'completo' ? 0.45 : 0 },
        { id: '2', color: '#000000', position: 1, opacity: overlay === 'completo' ? 0.45 : 0.75 },
      ],
    },
  } as Layer
}

/** Converte um bloco posicionado pelo modelo em camada de texto. */
function buildTextoLivreLayer(
  texto: TextoLivre,
  index: number,
  pair: FontComboPair,
  width: number,
  height: number,
  order: number,
  sombraPadrao: boolean,
): Layer {
  const escala = width / 1080
  const lineHeight = texto.lineHeight ?? 1.1
  const fontSize = Math.round(texto.fontSize * escala)
  const linhas = texto.texto.split('\n').length
  const usaSombra = texto.sombra ?? sombraPadrao

  return {
    id: createId(),
    type: 'text',
    name: `Texto ${index + 1}`,
    visible: true,
    locked: false,
    order,
    content: texto.texto,
    position: { x: Math.round(texto.x * width), y: Math.round(texto.y * height) },
    size: {
      width: Math.round(texto.width * width),
      height: Math.round(fontSize * lineHeight * linhas),
    },
    style: {
      fontSize,
      fontFamily: texto.fontFamily ?? resolveComboFontFamily(texto.role ?? 'body', pair),
      fontWeight: texto.fontWeight ?? (texto.role === 'title' ? '700' : texto.role === 'subtitle' ? '600' : '400'),
      fontStyle: texto.fontStyle ?? 'normal',
      color: texto.color ?? '#FFFFFF',
      textAlign: texto.textAlign ?? 'center',
      lineHeight,
      letterSpacing: texto.letterSpacing ? Math.round(texto.letterSpacing * escala) : undefined,
      textTransform: texto.textTransform ?? 'none',
    },
    textboxConfig: {
      textMode: 'auto-wrap-fixed',
      // Mesmo valor do style: o render prefere este campo (ver render-engine)
      autoWrap: { lineHeight, breakMode: 'word', autoExpand: false },
    },
    ...(usaSombra ? { effects: { shadow: SOMBRA_LEGIBILIDADE } } : {}),
  } as Layer
}

/**
 * Monta e renderiza uma arte do zero: fundo, sombreado opcional, texto (por
 * combinação ou posicionado livremente) e logo da marca.
 */
export async function createArteLivre(input: CreateArteLivreInput): Promise<CreateArteLivreResult> {
  const project = await db.project.findUnique({
    where: { id: input.projectId },
    select: {
      id: true,
      name: true,
      userId: true,
      titleFontFamily: true,
      subtitleFontFamily: true,
      bodyFontFamily: true,
      CustomFont: { select: { fontFamily: true }, orderBy: { id: 'asc' } },
      Logo: {
        select: { fileUrl: true, isProjectLogo: true },
        orderBy: [{ isProjectLogo: 'desc' }, { id: 'asc' }],
        take: 1,
      },
    },
  })
  if (!project) {
    throw new CreativeError('PROJECT_NOT_FOUND', `Projeto não encontrado: ${input.projectId}`, 404)
  }

  if (!input.combinationId && !input.textosLivres?.length) {
    throw new CreativeError(
      'SEM_TEXTO',
      'Informe combinationId (com textos) ou textosLivres — a arte precisa de pelo menos um bloco de texto.',
      400,
    )
  }

  const preset = FORMAT_PRESETS[input.formato ?? 'story']
  const width = input.width ?? preset.width
  const height = input.height ?? preset.height
  const type = input.width || input.height ? inferTemplateType(width, height) : preset.type

  const arteTemplate = await ensureArteTemplate(project.id, project.userId, type, `${width}x${height}`)

  const resolved = await resolveImageUrl(input.imageUrl, input.driveImageId)
  const temFoto = Boolean(resolved.url)

  // Marca sem par configurado cai na fonte padrão, e não na primeira fonte
  // enviada — mesma decisão do editor: adivinhar fazia uma fonte qualquer virar
  // o título da marca sem ninguém escolher. O aviso avisa quem chamou.
  const pair: FontComboPair = {
    title: project.titleFontFamily ?? FONT_CONFIG.DEFAULT_FONT,
    body: project.bodyFontFamily ?? FONT_CONFIG.DEFAULT_FONT,
    // Ausente de propósito quando a marca só tem duas fontes: o papel de
    // subtítulo cai no corpo em vez de repetir a mesma família num campo.
    subtitle: project.subtitleFontFamily,
  }
  const avisoFontes =
    !project.titleFontFamily || !project.bodyFontFamily
      ? `O projeto não tem o par de fontes da marca configurado, então a arte saiu em ${FONT_CONFIG.DEFAULT_FONT}. Defina o par no painel de texto do editor${project.CustomFont.length > 0 ? ` (o projeto já tem ${project.CustomFont.length} fontes cadastradas)` : ''}, ou passe fontFamily em cada bloco.`
      : undefined

  const layers: Layer[] = []

  // 1. Fundo
  if (resolved.url) {
    layers.push({
      id: createId(),
      type: 'image',
      name: 'Fundo',
      visible: true,
      locked: false,
      order: layers.length,
      position: { x: 0, y: 0 },
      size: { width, height },
      fileUrl: resolved.url,
      style: { objectFit: 'cover' },
    } as Layer)
  }

  // 2. Sombreado — só faz sentido sobre foto
  const overlay = input.overlay ?? (temFoto ? 'inferior' : 'nenhum')
  const overlayLayer = temFoto ? buildOverlayLayer(overlay, width, height, layers.length) : null
  if (overlayLayer) layers.push(overlayLayer)

  // 3. Texto
  let composicao: 'combinacao' | 'livre' = 'livre'
  let combinacaoUsada: string | undefined

  if (input.combinationId) {
    await ensureFontCombinations(project.id)
    const combo = await db.fontCombination.findFirst({
      where: { id: input.combinationId, projectId: project.id },
    })
    if (!combo) {
      throw new CreativeError(
        'COMBINACAO_NAO_ENCONTRADA',
        `Combinação ${input.combinationId} não existe neste projeto.`,
        404,
      )
    }
    const comboLayers = buildComboLayers({
      elements: combo.elements as any,
      pair,
      canvasWidth: width,
      canvasHeight: height,
      comboId: combo.id,
      comboName: combo.name,
      textOverrides: input.textos,
    })

    // Texto da IA maior (ou menor) que o exemplo da combinação: medir a
    // quebra real e reacomodar a pilha — sem isso a caixa estimada corta o
    // texto e os elementos de baixo não acompanham. Fontes registradas ANTES
    // de medir, senão a medida sai do fallback.
    await registerProjectFonts(project.id)
    const measure = await createServerTextMeasurer()
    const reflowed = applyStackPatches(comboLayers, reflowComboStack(comboLayers, measure))

    reflowed.forEach((layer, i) => layers.push({ ...layer, order: layers.length + i }))
    composicao = 'combinacao'
    combinacaoUsada = combo.name
  } else {
    input.textosLivres!.forEach((texto, i) =>
      layers.push(buildTextoLivreLayer(texto, i, pair, width, height, layers.length, temFoto)),
    )
  }

  const camadasDeTexto = layers.filter((l) => l.type === 'text').length

  // 4. Logo da marca, canto inferior
  const logoUrl = project.Logo[0]?.fileUrl
  if ((input.logo ?? true) && logoUrl) {
    const logoWidth = Math.round(width * 0.18)
    layers.push({
      id: createId(),
      type: 'logo',
      name: 'Logo',
      visible: true,
      locked: false,
      order: layers.length,
      position: { x: Math.round((width - logoWidth) / 2), y: Math.round(height - logoWidth * 1.4) },
      size: { width: logoWidth, height: logoWidth },
      fileUrl: logoUrl,
      style: { objectFit: 'contain' },
    } as Layer)
  }

  const pageName = input.name ?? `Arte livre — ${new Date().toLocaleString('pt-BR')}`

  const persisted = await persistAndRenderCreative({
    project,
    templateId: arteTemplate.id,
    templateName: arteTemplate.name,
    pageName,
    width,
    height,
    layers,
    background: input.backgroundColor ?? (temFoto ? null : '#111111'),
    authorName: 'arte-livre',
    fieldValues: {
      source: 'arte-livre',
      composicao,
      combinationId: input.combinationId ?? null,
      combinacaoUsada: combinacaoUsada ?? null,
      textos: input.textos ?? null,
      textosLivres: input.textosLivres ?? null,
      imageUrl: resolved.url,
      driveImageId: input.driveImageId ?? null,
      overlay,
      fontes: pair,
    },
  })

  return {
    created: true,
    ...persisted,
    composicao,
    ...(combinacaoUsada ? { combinacaoUsada } : {}),
    camadasDeTexto,
    ...(resolved.warning ? { imageWarning: resolved.warning } : {}),
    ...(avisoFontes ? { avisoFontes } : {}),
    // Lembra o passo seguinte: sem isso a arte fica pronta e ninguém a coloca
    // na agenda, e a pessoa não sabe que ainda falta esse passo.
    proximoPasso:
      'Mostre a arte para a pessoa (link acima) e, se ela aprovar, use colocar-na-agenda como rascunho. Só agende de verdade com confirmação explícita.',
  }
}

/**
 * Combinações do projeto, semeando o catálogo base no primeiro acesso — mesmo
 * comportamento da rota que o editor usa, senão um projeto em que ninguém
 * abriu o painel apareceria sem nenhuma combinação para o modelo escolher.
 */
export async function ensureFontCombinations(projectId: number) {
  const existentes = await db.fontCombination.findMany({
    where: { projectId },
    orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
  })
  if (existentes.length > 0) return existentes

  await db.fontCombination.createMany({
    data: FONT_COMBO_LAYOUTS.map((layout, index) => ({
      projectId,
      name: layout.name,
      order: index,
      elements: layout.elements as never,
      isDefault: true,
    })),
  })
  console.log(`[arte-livre] catálogo base semeado no projeto ${projectId}`)

  return db.fontCombination.findMany({
    where: { projectId },
    orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
  })
}

/** Combinações tipográficas do projeto, para o modelo escolher uma. */
export async function listFontCombinations(projectId: number) {
  const combos = await ensureFontCombinations(projectId)

  return {
    count: combos.length,
    combinations: combos.map((combo) => ({
      id: combo.id,
      name: combo.name,
      isDefault: combo.isDefault,
      elements: (combo.elements as any[]).map((el) => ({
        id: el.id,
        label: el.label,
        role: el.role,
        textoAtual: el.text,
        fontSize: el.fontSize,
        posicao: { x: el.x, y: el.y, width: el.width },
      })),
    })),
  }
}
