import OpenAI from 'openai'
import { toFile } from 'openai/uploads'

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

/**
 * Limite de área para textos, expressado em linguagem visual.
 * O gpt-image entende melhor descrições visuais do que percentuais matemáticos.
 * Customizável via env (ex: "no máximo 20% da arte" ou "muito compactos, ocupando
 * menos de um quinto da imagem").
 */
const TEXT_AREA_HINT =
  process.env.OPENAI_IMAGE_TEXT_AREA_HINT ||
  'no máximo um quarto (cerca de 25%) da área visual total da arte'

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

function buildPedidoSection(userRequest: string, hasBackground: boolean): string {
  const trimmed = userRequest.trim()
  if (trimmed.length > 0) {
    return `[PEDIDO DO CLIENTE]\n${trimmed}`
  }
  if (hasBackground) {
    return `[PEDIDO DO CLIENTE]\nSubstitua APENAS o fundo do criativo pela nova imagem fornecida. Mantenha EXATAMENTE textos, logo, cores da marca e tipografia da IMAGEM 1 — não reescreva, não traduza, não troque ordem nem adicione conteúdo.`
  }
  return `[PEDIDO DO CLIENTE]\nAprimoramento geral: aplique apenas as diretrizes do Diretor de Arte (hierarquia, espaçamentos, contraste, ênfase). Mantenha EXATAMENTE o mesmo conteúdo de textos da arte original — não reescreva, não traduza, não acrescente palavras.`
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
  return `[INTEGRAÇÃO DO NOVO FUNDO]
- Identifique o ponto focal e as áreas mais "limpas" da nova imagem de fundo e posicione os blocos de texto sobre essas áreas para preservar legibilidade.
- Se necessário, aplique um leve overlay (gradiente sutil escuro ou claro, no máximo 25% de opacidade) APENAS atrás dos textos para garantir contraste — nunca cobrindo a imagem inteira.
- Se a nova imagem de fundo tem alto contraste/cores fortes, ajuste a cor do texto e/ou da logo (mantendo a paleta da marca) para preservar legibilidade.
- Não altere a iluminação, saturação ou conteúdo da nova imagem de fundo em si — apenas a sobreponha.`
}

function buildPrompt({ userRequest, references, brandColors }: BuildPromptArgs): string {
  const hasBackground = references.some((r) => r.role === 'background')
  const hasReferences = references.length > 0

  const sections: string[] = []

  sections.push(`[INSTRUÇÃO TIPOGRÁFICA — PRIORIDADE MÁXIMA]
Antes de qualquer outra modificação, examine cuidadosamente a tipografia da arte original (IMAGEM 1) e siga estas regras críticas:

TAMANHO DOS TEXTOS: os blocos de texto na versão melhorada devem ocupar ${TEXT_AREA_HINT}. Os textos devem permanecer COMPACTOS e DISCRETOS. NUNCA aumente o tamanho dos textos em relação à arte original — eles devem ter o mesmo tamanho ou menores. Não use ampliação de fonte para destacar informações; use peso, cor ou posição.

FIDELIDADE TIPOGRÁFICA: replique fielmente as fontes da IMAGEM 1. Observe a família tipográfica (serif, sans-serif, display, manuscrita), o peso (light, regular, medium, bold, black) e o estilo (italic, normal). Mantenha exatamente o mesmo tipo de letra. Se a IMAGEM 1 usa uma fonte com personalidade marcante, preserve essa personalidade. NÃO modernize, NÃO substitua por fontes "mais limpas", NÃO troque serif por sans-serif (ou vice-versa).

PROPORÇÃO INTERNA: a relação de tamanho entre título, subtítulo, corpo de texto e detalhes deve permanecer EXATAMENTE como na IMAGEM 1. Se o título original era 3× maior que o corpo, mantenha 3×. Não inverta nem altere essa hierarquia.`)

  if (hasReferences) {
    sections.push(buildContextSection(references))
  }

  const colorsSection = buildBrandColorsSection(brandColors)
  if (colorsSection) sections.push(colorsSection)

  sections.push(buildPedidoSection(userRequest, hasBackground))

  sections.push(`[PAPEL]
Atue como um Diretor de Arte Sênior focado em design de comunicação. ${
    hasBackground
      ? 'Sua tarefa é montar a versão final da peça posicionando os elementos da IMAGEM 1 sobre a nova imagem de fundo, com foco em leitura rápida em dispositivos móveis e elevando organização, clareza e percepção de valor.'
      : 'Sua tarefa é aprimorar o layout da peça fornecida, elevando organização, clareza e percepção de valor, com foco em leitura rápida em dispositivos móveis.'
  }`)

  const restricoes: string[] = ['[RESTRIÇÕES ABSOLUTAS — O QUE NÃO ALTERAR]']
  if (hasBackground) {
    restricoes.push(
      '- Use a nova imagem de fundo (IMAGEM 2) como fundo da peça final, ocupando 100% da área visível. Não recorte de forma agressiva; preserve o ponto focal natural da imagem.',
    )
  } else {
    restricoes.push('- Preserve exatamente a mesma imagem de fundo da peça original.')
  }
  restricoes.push('- Mantenha a identidade visual e a paleta de cores da marca.')
  restricoes.push('- Mantenha a mesma família tipográfica (ver INSTRUÇÃO TIPOGRÁFICA acima).')
  restricoes.push(
    '- Não altere, distorça ou reposicione a logo de forma a perder reconhecimento. Pode mover dentro do enquadramento, mas mantenha proporções e cores.',
  )
  sections.push(restricoes.join('\n'))

  if (hasBackground) {
    sections.push(buildBackgroundIntegrationSection())
  }

  const assetsUsage = buildAssetsUsageSection(references)
  if (assetsUsage) sections.push(assetsUsage)

  sections.push(`[DIRETRIZES DE COMPOSIÇÃO E TEXTO]
- Hierarquia visual: reorganize alinhamento e distribuição dos blocos de texto para leitura lógica e equilibrada, evitando poluição visual.
- Espaçamento: ajuste os respiros (white space) entre elementos para conforto de leitura${hasBackground ? ' sobre a nova imagem de fundo' : ''}.
- Ênfase: use peso da fonte, cor ou posição (NÃO tamanho) para destacar informações.
- Contraste: garanta alto contraste do texto contra o fundo${hasBackground ? ' — usando overlay sutil ou ajuste de cor de fonte se necessário' : ''}.`)

  sections.push(`[ACABAMENTO ESTÉTICO]
- Aplique uma textura sutil e coerente APENAS no título principal, sem comprometer legibilidade.`)

  const reforco: string[] = ['[REFORÇO FINAL — REGRAS CRÍTICAS]']
  reforco.push(`- TEXTOS COMPACTOS: ocupando ${TEXT_AREA_HINT}.`)
  reforco.push('- FONTES IDÊNTICAS às da IMAGEM 1 — mesma família, peso e estilo.')
  reforco.push('- PROPORÇÕES TIPOGRÁFICAS preservadas — sem ampliação.')
  if (hasBackground) {
    reforco.push('- FUNDO = nova imagem fornecida (IMAGEM 2), sem alterações de conteúdo na imagem em si.')
  }
  sections.push(reforco.join('\n'))

  sections.push(
    hasBackground
      ? 'O resultado deve ser uma versão altamente profissional e bem resolvida, combinando o conteúdo gráfico da IMAGEM 1 com o novo fundo, mantendo a essência e a identidade da marca do cliente.'
      : 'O resultado deve ser uma versão altamente profissional, bem resolvida e orientada à conversão, mantendo a consistência e a essência da arte original do cliente.',
  )

  return sections.join('\n\n')
}

interface ImproveCreativeOptions {
  imageBuffer: Buffer
  mimeType: string
  userRequest: string
  size: string
  references?: ReferenceImage[]
  brandColors?: BrandColor[]
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
  timeoutMs = DEFAULT_TIMEOUT_MS,
}: ImproveCreativeOptions): Promise<Buffer> {
  const client = getClient()

  const prompt = buildPrompt({ userRequest, references, brandColors })

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
    console.log(
      `[improveCreative] ${IMAGE_MODEL} ${size} concluído em ${(elapsed / 1000).toFixed(1)}s${refSuffix}`,
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
