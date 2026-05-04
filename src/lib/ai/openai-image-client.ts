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

function buildArtDirectorPrompt(): string {
  return `[INSTRUÇÃO TIPOGRÁFICA — PRIORIDADE MÁXIMA]
Antes de qualquer outra modificação, examine cuidadosamente a tipografia da arte original e siga estas regras críticas:

TAMANHO DOS TEXTOS: os blocos de texto na versão melhorada devem ocupar ${TEXT_AREA_HINT}. Os textos devem permanecer COMPACTOS e DISCRETOS. NUNCA aumente o tamanho dos textos em relação à arte original — eles devem ter o mesmo tamanho ou menores. Não use ampliação de fonte para destacar informações; use peso, cor ou posição.

FIDELIDADE TIPOGRÁFICA: replique fielmente as fontes da arte original. Observe a família tipográfica (serif, sans-serif, display, manuscrita), o peso (light, regular, medium, bold, black) e o estilo (italic, normal). Mantenha exatamente o mesmo tipo de letra. Se a original usa uma fonte com personalidade marcante, preserve essa personalidade. NÃO modernize, NÃO substitua por fontes "mais limpas", NÃO troque serif por sans-serif (ou vice-versa).

PROPORÇÃO INTERNA: a relação de tamanho entre título, subtítulo, corpo de texto e detalhes deve permanecer EXATAMENTE como na original. Se o título original era 3× maior que o corpo, mantenha 3×. Não inverta nem altere essa hierarquia.

[PAPEL]
Atue como um Diretor de Arte Sênior focado em design de comunicação. Sua tarefa é aprimorar o layout da peça fornecida, elevando organização, clareza e percepção de valor, com foco em leitura rápida em dispositivos móveis.

[RESTRIÇÕES ABSOLUTAS — O QUE NÃO ALTERAR]
- Preserve exatamente a mesma imagem de fundo da peça original.
- Mantenha a identidade visual e a paleta de cores da marca.
- Mantenha a mesma família tipográfica (ver INSTRUÇÃO TIPOGRÁFICA acima).
- Não altere, distorça ou reposicione a logo.

[DIRETRIZES DE COMPOSIÇÃO E TEXTO]
- Hierarquia visual: reorganize alinhamento e distribuição dos blocos de texto para leitura lógica e equilibrada, evitando poluição visual.
- Espaçamento: ajuste os respiros (white space) entre elementos para conforto de leitura.
- Ênfase: use peso da fonte, cor ou posição (NÃO tamanho) para destacar informações.
- Contraste: garanta alto contraste do texto contra o fundo.

[ACABAMENTO ESTÉTICO]
- Aplique uma textura sutil e coerente APENAS no título principal, sem comprometer legibilidade.

[REFORÇO FINAL — REGRAS CRÍTICAS]
- TEXTOS COMPACTOS: ocupando ${TEXT_AREA_HINT}.
- FONTES IDÊNTICAS às da arte original — mesma família, peso e estilo.
- PROPORÇÕES TIPOGRÁFICAS preservadas — sem ampliação.

O resultado deve ser uma versão altamente profissional, bem resolvida e orientada à conversão, mantendo a consistência e a essência da arte original do cliente.`
}

interface ImproveCreativeOptions {
  imageBuffer: Buffer
  mimeType: string
  userRequest: string
  size: string
  timeoutMs?: number
}

// Tempo máximo da chamada à OpenAI. O endpoint /improve roda em background
// com maxDuration=300, então temos folga até ~290s. gpt-image-2 high tipicamente
// fica em 30-90s, mas pode chegar a 3min em casos extremos.
const DEFAULT_TIMEOUT_MS = 280_000

/**
 * Envia o criativo + pedido do usuário pra OpenAI gpt-image-2 (image edit endpoint)
 * usando o prompt fixo do "Diretor de Arte Sênior" com a seção [PEDIDO DO CLIENTE]
 * injetada antes das restrições.
 */
export async function improveCreative({
  imageBuffer,
  mimeType,
  userRequest,
  size,
  timeoutMs = DEFAULT_TIMEOUT_MS,
}: ImproveCreativeOptions): Promise<Buffer> {
  const client = getClient()

  const prompt = `${buildPedidoSection(userRequest)}\n\n${buildArtDirectorPrompt()}`

  const extension = mimeType.includes('png') ? 'png' : mimeType.includes('webp') ? 'webp' : 'jpg'
  const imageFile = await toFile(imageBuffer, `original.${extension}`, { type: mimeType })

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)
  const startedAt = Date.now()

  try {
    // SDK v6.25 ainda tipa `size` com os valores antigos do gpt-image-1.
    // gpt-image-2 aceita "qualquer resolução" (múltipla de 16, max 3840px) — cast
    // necessário até a SDK atualizar o type. https://developers.openai.com/api/docs/guides/image-generation
    const response = await client.images.edit(
      {
        model: IMAGE_MODEL,
        image: imageFile,
        prompt,
        size: size as never,
        quality: 'high',
        n: 1,
      },
      { signal: controller.signal },
    )

    const elapsed = Date.now() - startedAt
    console.log(`[improveCreative] ${IMAGE_MODEL} ${size} concluído em ${(elapsed / 1000).toFixed(1)}s`)

    const b64 = response.data?.[0]?.b64_json
    if (!b64) {
      throw new Error('OpenAI não retornou dados de imagem')
    }
    return Buffer.from(b64, 'base64')
  } catch (error) {
    const elapsed = Date.now() - startedAt
    console.warn(`[improveCreative] ${IMAGE_MODEL} ${size} falhou após ${(elapsed / 1000).toFixed(1)}s`)
    throw error
  } finally {
    clearTimeout(timeout)
  }
}

function buildPedidoSection(userRequest: string): string {
  const trimmed = userRequest.trim()
  if (trimmed.length === 0) {
    // Aprimoramento geral: o usuário não pediu mudanças específicas.
    // Instrução padrão deixa explícito pro modelo NÃO inventar conteúdo novo.
    return `[PEDIDO DO CLIENTE]\nAprimoramento geral: aplique apenas as diretrizes do Diretor de Arte (hierarquia, espaçamentos, contraste, ênfase). Mantenha EXATAMENTE o mesmo conteúdo de textos da arte original — não reescreva, não traduza, não acrescente palavras.`
  }
  return `[PEDIDO DO CLIENTE]\n${trimmed}`
}
