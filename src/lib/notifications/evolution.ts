/**
 * Cliente mínimo da Evolution API (WhatsApp) para avisos internos da equipe.
 *
 * Regra de ouro: notificação NUNCA derruba o fluxo que a chamou. Todo erro é
 * logado e engolido — uma publicação não pode falhar porque o WhatsApp estava
 * fora do ar. Por isso `sendWhatsAppText` devolve boolean em vez de lançar.
 *
 * Envio na Evolution v2:
 *   POST {EVOLUTION_API_URL}/message/sendText/{EVOLUTION_INSTANCE}   body { number, text }
 *   POST {EVOLUTION_API_URL}/message/sendMedia/{EVOLUTION_INSTANCE}  body { number, mediatype, media, caption }
 *   header: apikey
 *
 * Para grupo, `number` é o JID do grupo (termina em `@g.us`).
 */

const SEND_TIMEOUT_MS = 10_000
/** Mídia é baixada pela Evolution a partir da URL, então demora mais que texto. */
const SEND_MEDIA_TIMEOUT_MS = 60_000

interface EvolutionConfig {
  apiUrl: string
  apiKey: string
  instance: string
  defaultRecipient: string
}

function readConfig(): EvolutionConfig | null {
  const apiUrl = process.env.EVOLUTION_API_URL?.trim()
  const apiKey = process.env.EVOLUTION_API_KEY?.trim()
  const instance = process.env.EVOLUTION_INSTANCE?.trim()
  const defaultRecipient = process.env.EVOLUTION_NOTIFY_GROUP_ID?.trim()

  if (!apiUrl || !apiKey || !instance || !defaultRecipient) {
    return null
  }

  return {
    apiUrl: apiUrl.replace(/\/+$/, ''),
    apiKey,
    instance,
    defaultRecipient,
  }
}

/**
 * Diz se as 4 variáveis de ambiente da Evolution estão configuradas.
 * Útil para pular o trabalho de montar mensagem quando não há para onde enviar.
 */
export function isEvolutionConfigured(): boolean {
  return readConfig() !== null
}

/** Nunca deixa a apikey vazar para o log. */
function sanitize(text: string, apiKey: string): string {
  return apiKey ? text.split(apiKey).join('***') : text
}

async function post(
  path: string,
  payload: Record<string, unknown>,
  timeoutMs: number,
  recipient?: string
): Promise<boolean> {
  const config = readConfig()

  if (!config) {
    console.warn(
      '[Evolution] Envio ignorado: configure EVOLUTION_API_URL, EVOLUTION_API_KEY, EVOLUTION_INSTANCE e EVOLUTION_NOTIFY_GROUP_ID'
    )
    return false
  }

  const number = recipient?.trim() || config.defaultRecipient
  const endpoint = `${config.apiUrl}/${path}/${encodeURIComponent(config.instance)}`

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: config.apiKey,
      },
      body: JSON.stringify({ number, ...payload }),
      signal: AbortSignal.timeout(timeoutMs),
    })

    if (!response.ok) {
      const body = await response.text().catch(() => '')
      console.error(
        `[Evolution] Envio recusado (HTTP ${response.status}) para ${number}:`,
        sanitize(body.slice(0, 500), config.apiKey)
      )
      return false
    }

    console.log(`[Evolution] ✅ Mensagem enviada para ${number}`)
    return true
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error(
      `[Evolution] Falha ao enviar para ${number}:`,
      sanitize(message, config.apiKey)
    )
    return false
  }
}

/**
 * Envia uma mensagem de texto pelo WhatsApp.
 *
 * @param recipient JID do destinatário. Omitido, usa EVOLUTION_NOTIFY_GROUP_ID.
 * @returns true se a Evolution aceitou o envio; false em qualquer outro caso.
 */
export async function sendWhatsAppText(
  text: string,
  recipient?: string
): Promise<boolean> {
  return post('message/sendText', { text }, SEND_TIMEOUT_MS, recipient)
}

function isVideoUrl(url: string): boolean {
  return /\.(mp4|mov|avi|webm)(\?.*)?$/i.test(url)
}

/**
 * Envia um DOCUMENTO (PDF por padrão) pelo WhatsApp. Mesmo transporte do
 * sendMedia, com `mediatype: 'document'` — o sendWhatsAppMedia decide entre
 * imagem e vídeo pela extensão e mandaria um PDF com mimetype de JPEG.
 * A URL precisa ser pública (as nossas ficam no Vercel Blob).
 */
export async function sendWhatsAppDocument(
  mediaUrl: string,
  options?: { caption?: string; recipient?: string; fileName?: string; mimetype?: string }
): Promise<boolean> {
  return post(
    'message/sendMedia',
    {
      mediatype: 'document',
      mimetype: options?.mimetype ?? 'application/pdf',
      media: mediaUrl,
      fileName: options?.fileName ?? 'documento.pdf',
      ...(options?.caption ? { caption: options.caption } : {}),
    },
    SEND_MEDIA_TIMEOUT_MS,
    options?.recipient
  )
}

/**
 * Envia uma imagem ou vídeo pelo WhatsApp. A Evolution baixa a mídia da URL,
 * que por isso precisa ser pública — as nossas ficam no Vercel Blob.
 *
 * @param caption Texto que acompanha a mídia (opcional).
 */
export async function sendWhatsAppMedia(
  mediaUrl: string,
  options?: { caption?: string; recipient?: string; fileName?: string }
): Promise<boolean> {
  const isVideo = isVideoUrl(mediaUrl)

  return post(
    'message/sendMedia',
    {
      mediatype: isVideo ? 'video' : 'image',
      mimetype: isVideo ? 'video/mp4' : 'image/jpeg',
      media: mediaUrl,
      fileName: options?.fileName || (isVideo ? 'arte.mp4' : 'arte.jpg'),
      ...(options?.caption ? { caption: options.caption } : {}),
    },
    SEND_MEDIA_TIMEOUT_MS,
    options?.recipient
  )
}
