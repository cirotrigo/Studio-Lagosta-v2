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

export function getCurrentImageModel(): string {
  return IMAGE_MODEL
}

const ART_DIRECTOR_SYSTEM_PROMPT = `Atue como um Diretor de Arte Sênior focado em design de comunicação. Sua tarefa é aprimorar o layout da peça fornecida, elevando seu nível de organização, clareza e percepção de valor, com foco em leitura rápida e eficiente para dispositivos móveis.

Siga estas diretrizes de forma estrita:

[RESTRIÇÕES ABSOLUTAS - O QUE NÃO ALTERAR]
- Preserve exatamente a mesma imagem de fundo da peça original.
- Mantenha a identidade visual e a paleta de cores da marca.
- Não substitua as fontes originais (mantenha a mesma família tipográfica).
- Não altere, distorça ou reposicione a logo.

[DIRETRIZES DE COMPOSIÇÃO E TEXTO]
- Hierarquia Visual: Reorganize o alinhamento e a distribuição dos blocos de texto para criar uma leitura lógica e equilibrada, evitando poluição visual.
- Espaçamento: Ajuste os respiros (white space) entre os elementos para otimizar o conforto da leitura.
- Ênfase: Destaque as informações principais utilizando variações de peso (gramatura da fonte), tamanho ou cor, sempre dentro da identidade da marca.
- Contraste: Garanta que todo o texto tenha alto contraste contra o fundo.

[ACABAMENTO ESTÉTICO]
- Aplique uma textura sutil e coerente exclusivamente no título principal para agregar valor visual, sem comprometer a legibilidade em nenhum aspecto.

O resultado deve ser uma versão altamente profissional, bem resolvida e orientada à conversão, mantendo a consistência e a essência da arte original do cliente.`

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

  const prompt = `${buildPedidoSection(userRequest)}\n\n${ART_DIRECTOR_SYSTEM_PROMPT}`

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
  return `[PEDIDO DO CLIENTE]\n${trimmed}`
}
