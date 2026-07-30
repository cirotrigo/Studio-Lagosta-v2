import OpenAI from 'openai'
import { toFile } from 'openai/uploads'
import { DEFAULT_ART_DIRECTION } from './art-direction'
import type { BrandIdentity } from './improvement-assets-loader'

let cachedClient: OpenAI | null = null

function getClient(): OpenAI {
  if (cachedClient) return cachedClient
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY não configurada')
  }
  cachedClient = new OpenAI({ apiKey })
  return cachedClient
}

/**
 * Modelo de geração de imagem usado pela melhoria de criativo.
 * Default: gpt-image-2. Requer organização verificada na OpenAI:
 * https://platform.openai.com/settings/organization/general
 *
 * Se a verificação ainda não propagou (até 15 min), defina
 * OPENAI_IMAGE_MODEL=gpt-image-1 no .env (não requer verificação).
 */
const IMAGE_MODEL = process.env.OPENAI_IMAGE_MODEL || 'gpt-image-2'

export function getCurrentImageModel(): string {
  return IMAGE_MODEL
}

export interface ReferenceImage {
  buffer: Buffer
  mimeType: string
  role: 'background' | 'logo' | 'element'
  label?: string
}

export interface BrandColor {
  name: string
  hexCode: string
}

interface BuildPromptArgs {
  userRequest: string
  references: ReferenceImage[]
  brandColors: BrandColor[]
  /** Direção de arte do projeto; cai no DEFAULT_ART_DIRECTION quando vazia. */
  artDirection?: string | null
  /** Identidade da marca; sempre do sistema, nunca do bloco editável. */
  identity?: BrandIdentity | null
}

function buildContextSection(references: ReferenceImage[]): string {
  const total = references.length + 1
  const lines: string[] = [`Você recebeu ${total} ${total === 1 ? 'imagem' : 'imagens'} de referência:`]
  let n = 1
  lines.push(
    `- IMAGEM ${n++}: a arte original do cliente. Extraia textos, logo, hierarquia e elementos gráficos daqui.`,
  )
  for (const ref of references) {
    if (ref.role === 'background') {
      lines.push(
        `- IMAGEM ${n++}: nova imagem de fundo escolhida pelo cliente. Substitui completamente o fundo atual da IMAGEM 1.`,
      )
    } else if (ref.role === 'logo') {
      lines.push(
        `- IMAGEM ${n++}: logo oficial do projeto${ref.label ? ` (${ref.label})` : ''}. Use exatamente esta versão da logo no resultado final.`,
      )
    } else if (ref.role === 'element') {
      lines.push(
        `- IMAGEM ${n++}: elemento gráfico do projeto${ref.label ? ` (${ref.label})` : ''} — badge, ícone ou ornamento disponível para enriquecer o design.`,
      )
    }
  }
  return `[CONTEXTO DAS IMAGENS]\n${lines.join('\n')}`
}

function buildBrandColorsSection(colors: BrandColor[]): string {
  if (colors.length === 0) return ''
  const list = colors.map((c) => `- ${c.name}: ${c.hexCode}`).join('\n')
  return `[CORES DA MARCA]\nA paleta oficial deste projeto:\n${list}\nPriorize estas cores para textos, ênfases e elementos visuais quando precisar ajustar contraste ou hierarquia.`
}

/**
 * Identidade do cliente. É o que faz a MESMA direção de arte produzir peças
 * diferentes por marca — sem isso, todo cliente recebe a mesma receita genérica.
 *
 * Montada pelo sistema, não pelo bloco editável: um prompt de projeto mal
 * escrito não deve poder apagar a tipografia e a paleta da marca.
 *
 * As fontes são a parte mais confiável (todos os 11 projetos têm as três
 * definidas); `brandStyleDescription` e `cuisineType` entram só quando
 * preenchidos, porque hoje quase todos estão vazios e uma linha "Estilo da
 * marca: null" só confundiria o modelo.
 */
function buildBrandIdentitySection(identity: BrandIdentity | null): string {
  if (!identity) return ''

  const lines: string[] = [`[IDENTIDADE DA MARCA — ${identity.projectName}]`]

  if (identity.styleDescription) {
    lines.push(`Estilo visual da marca: ${identity.styleDescription}`)
  }
  if (identity.cuisineType) {
    lines.push(`Tipo de cozinha: ${identity.cuisineType}`)
  }

  const fontes: string[] = []
  if (identity.titleFont) fontes.push(`títulos em ${identity.titleFont}`)
  // Subtítulo nulo significa "a marca usa a fonte de corpo também no subtítulo"
  // (ver comentário no schema) — dizer isso é melhor que omitir a linha.
  if (identity.subtitleFont) {
    fontes.push(`subtítulos em ${identity.subtitleFont}`)
  } else if (identity.bodyFont) {
    fontes.push(`subtítulos na mesma fonte do corpo`)
  }
  if (identity.bodyFont) fontes.push(`corpo em ${identity.bodyFont}`)

  if (fontes.length > 0) {
    lines.push(
      `Tipografia oficial: ${fontes.join(', ')}. Replique o desenho das letras como está na IMAGEM 1 — estes nomes servem para você reconhecer a fonte, não para substituí-la por outra parecida.`,
    )
  }

  return lines.length > 1 ? lines.join('\n') : ''
}

function buildPedidoSection(userRequest: string): string {
  const trimmed = userRequest.trim()
  if (trimmed.length === 0) return ''
  return `[PEDIDO DO CLIENTE]
${trimmed}

Este pedido tem prioridade sobre as diretrizes de diagramação acima, mas nunca
sobre os limites (palavras, família tipográfica, paleta e logo).`
}

function buildAssetsUsageSection(references: ReferenceImage[]): string {
  const hasLogo = references.some((r) => r.role === 'logo')
  const hasElement = references.some((r) => r.role === 'element')
  if (!hasLogo && !hasElement) return ''
  const lines: string[] = ['[USO DOS ASSETS DO PROJETO]']
  if (hasLogo) {
    lines.push(
      '- Logo: foi fornecida como referência. Use essa versão exata no resultado. Se a IMAGEM 1 já tem essa logo, mantenha. Se a logo na IMAGEM 1 está em qualidade ruim ou em variação diferente, prefira a versão da referência.',
    )
  }
  if (hasElement) {
    lines.push(
      '- Elementos gráficos: use os elementos fornecidos APENAS se reforçarem o pedido do cliente ou se houver espaço composicional para eles. Não force inclusão. Mantenha cores e proporções dos elementos como recebidos.',
    )
  }
  return lines.join('\n')
}

function buildBackgroundIntegrationSection(): string {
  return `[NOVO FUNDO]
A nova imagem de fundo substitui completamente o fundo da IMAGEM 1 e ocupa 100%
da área visível. Preserve o ponto focal natural dela — não recorte de forma
agressiva e não altere seu conteúdo. Aplique a [LEITURA DA FOTO] sobre esta nova
imagem, não sobre a original.`
}

/**
 * Monta o prompt final.
 *
 * O que o sistema é dono e o projeto não pode reescrever: o mapa das imagens
 * (quem é IMAGEM 1, 2, 3…, que depende do que foi anexado em runtime), a paleta
 * da marca, o uso dos assets e o pedido do cliente. O miolo — a direção de arte
 * — é `artDirection`, que vem do projeto quando ele tem um prompt próprio e cai
 * no DEFAULT_ART_DIRECTION quando não tem.
 */
function buildPrompt({ userRequest, references, brandColors, artDirection, identity }: BuildPromptArgs): string {
  const hasBackground = references.some((r) => r.role === 'background')
  const sections: string[] = []

  if (references.length > 0) {
    sections.push(buildContextSection(references))
  }

  const identitySection = buildBrandIdentitySection(identity ?? null)
  if (identitySection) sections.push(identitySection)

  const colorsSection = buildBrandColorsSection(brandColors)
  if (colorsSection) sections.push(colorsSection)

  const direction = artDirection?.trim() || DEFAULT_ART_DIRECTION
  sections.push(direction)

  if (hasBackground) {
    sections.push(buildBackgroundIntegrationSection())
  }

  const assetsUsage = buildAssetsUsageSection(references)
  if (assetsUsage) sections.push(assetsUsage)

  const pedido = buildPedidoSection(userRequest)
  if (pedido) sections.push(pedido)

  return sections.join('\n\n')
}

interface ImproveCreativeOptions {
  imageBuffer: Buffer
  mimeType: string
  userRequest: string
  size: string
  references?: ReferenceImage[]
  brandColors?: BrandColor[]
  /** `Project.artImprovementPrompt` — substitui a direção de arte padrão. */
  artDirection?: string | null
  /** Identidade da marca (fontes, estilo, cozinha) — injetada pelo sistema. */
  identity?: BrandIdentity | null
  timeoutMs?: number
}

// Tempo máximo da chamada à OpenAI. O endpoint /improve roda em background
// com maxDuration=300, então temos folga até ~290s. gpt-image-2 high tipicamente
// fica em 30-90s, mas pode chegar a 3min em casos extremos.
const DEFAULT_TIMEOUT_MS = 280_000

function extensionFromMime(mimeType: string): string {
  if (mimeType.includes('png')) return 'png'
  if (mimeType.includes('webp')) return 'webp'
  if (mimeType.includes('gif')) return 'gif'
  return 'jpg'
}

/**
 * Envia o criativo + pedido do usuário pra OpenAI gpt-image (image edit endpoint).
 * Quando há `references`, envia múltiplas imagens (background, logos, elementos)
 * e usa um prompt dinâmico que enumera o papel de cada IMAGEM N.
 */
export async function improveCreative({
  imageBuffer,
  mimeType,
  userRequest,
  size,
  references = [],
  brandColors = [],
  artDirection = null,
  identity = null,
  timeoutMs = DEFAULT_TIMEOUT_MS,
}: ImproveCreativeOptions): Promise<Buffer> {
  const client = getClient()

  const prompt = buildPrompt({ userRequest, references, brandColors, artDirection, identity })

  const primaryFile = await toFile(imageBuffer, `original.${extensionFromMime(mimeType)}`, {
    type: mimeType,
  })

  const referenceFiles = await Promise.all(
    references.map((ref, idx) =>
      toFile(ref.buffer, `${ref.role}-${idx + 1}.${extensionFromMime(ref.mimeType)}`, {
        type: ref.mimeType,
      }),
    ),
  )

  const imageParam = referenceFiles.length > 0 ? [primaryFile, ...referenceFiles] : primaryFile

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)
  const startedAt = Date.now()

  const refCounts = {
    bg: references.filter((r) => r.role === 'background').length,
    logos: references.filter((r) => r.role === 'logo').length,
    elements: references.filter((r) => r.role === 'element').length,
  }

  try {
    // SDK v6.25 ainda tipa `size` com os valores antigos do gpt-image-1.
    // gpt-image-2 aceita "qualquer resolução" (múltipla de 16, max 3840px) — cast
    // necessário até a SDK atualizar o type. https://developers.openai.com/api/docs/guides/image-generation
    const response = await client.images.edit(
      {
        model: IMAGE_MODEL,
        image: imageParam,
        prompt,
        size: size as never,
        quality: 'high',
        n: 1,
      },
      { signal: controller.signal },
    )

    const elapsed = Date.now() - startedAt
    const refSuffix =
      references.length > 0
        ? ` (refs: bg=${refCounts.bg}, logos=${refCounts.logos}, elements=${refCounts.elements})`
        : ''
    const directionSuffix = artDirection?.trim() ? ' [direção do projeto]' : ''
    console.log(
      `[improveCreative] ${IMAGE_MODEL} ${size} concluído em ${(elapsed / 1000).toFixed(1)}s${refSuffix}${directionSuffix}`,
    )

    const b64 = response.data?.[0]?.b64_json
    if (!b64) {
      throw new Error('OpenAI não retornou dados de imagem')
    }
    return Buffer.from(b64, 'base64')
  } catch (error) {
    const elapsed = Date.now() - startedAt
    console.warn(
      `[improveCreative] ${IMAGE_MODEL} ${size} falhou após ${(elapsed / 1000).toFixed(1)}s`,
    )
    throw error
  } finally {
    clearTimeout(timeout)
  }
}
