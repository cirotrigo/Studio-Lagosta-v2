/**
 * Cliente mínimo de WhatsApp para avisos internos da equipe, pelo WAHA.
 *
 * O arquivo e os nomes exportados (`isEvolutionConfigured`…) ficaram da época
 * da Evolution API, que caiu em 29/09/2026 (403 "primary device was logged
 * out") e foi trocada pelo WAHA em 03/10/2026. Seis chamadores importam daqui;
 * renomear seria churn sem ganho.
 *
 * Regra de ouro: notificação NUNCA derruba o fluxo que a chamou. Todo erro é
 * logado e engolido — uma publicação não pode falhar porque o WhatsApp estava
 * fora do ar. Por isso as funções devolvem boolean em vez de lançar.
 *
 * Envio no WAHA (header `X-Api-Key`):
 *   POST {WAHA_API_URL}/api/sendText   { session, chatId, text }
 *   POST {WAHA_API_URL}/api/sendImage  { session, chatId, file: { url, mimetype, filename }, caption }
 *   POST {WAHA_API_URL}/api/sendVideo  { … mesmo formato }
 *   POST {WAHA_API_URL}/api/sendFile   { … mesmo formato }
 *
 * A chave é ESCOPADA à sessão do número comercial, só com envio: a sessão
 * pessoal do Ciro roda no mesmo WAHA e não pode ser alcançável daqui.
 * Para grupo, `chatId` é o JID do grupo (termina em `@g.us`).
 */

const SEND_TIMEOUT_MS = 10_000
/** Mídia é baixada pelo WAHA a partir da URL, então demora mais que texto. */
const SEND_MEDIA_TIMEOUT_MS = 60_000

interface WahaConfig {
  apiUrl: string
  apiKey: string
  session: string
  defaultRecipient: string
}

function readConfig(): WahaConfig | null {
  const apiUrl = process.env.WAHA_API_URL?.trim()
  const apiKey = process.env.WAHA_API_KEY?.trim()
  const session = process.env.WAHA_SESSION?.trim()
  const defaultRecipient = process.env.WAHA_NOTIFY_GROUP_ID?.trim()

  if (!apiUrl || !apiKey || !session || !defaultRecipient) {
    return null
  }

  return {
    apiUrl: apiUrl.replace(/\/+$/, ''),
    apiKey,
    session,
    defaultRecipient,
  }
}

/**
 * Diz se as 4 variáveis de ambiente do WAHA estão configuradas.
 * Útil para pular o trabalho de montar mensagem quando não há para onde enviar.
 */
export function isEvolutionConfigured(): boolean {
  return readConfig() !== null
}

/** Nunca deixa a chave vazar para o log. */
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
      '[WhatsApp] Envio ignorado: configure WAHA_API_URL, WAHA_API_KEY, WAHA_SESSION e WAHA_NOTIFY_GROUP_ID'
    )
    return false
  }

  const chatId = recipient?.trim() || config.defaultRecipient

  try {
    const response = await fetch(`${config.apiUrl}/api/${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Api-Key': config.apiKey,
      },
      body: JSON.stringify({ session: config.session, chatId, ...payload }),
      signal: AbortSignal.timeout(timeoutMs),
    })

    if (!response.ok) {
      const body = await response.text().catch(() => '')
      console.error(
        `[WhatsApp] Envio recusado (HTTP ${response.status}) para ${chatId}:`,
        sanitize(body.slice(0, 500), config.apiKey)
      )
      return false
    }

    console.log(`[WhatsApp] ✅ Mensagem enviada para ${chatId}`)
    return true
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error(
      `[WhatsApp] Falha ao enviar para ${chatId}:`,
      sanitize(message, config.apiKey)
    )
    return false
  }
}

/**
 * Envia uma mensagem de texto pelo WhatsApp.
 *
 * @param recipient JID do destinatário. Omitido, usa WAHA_NOTIFY_GROUP_ID.
 * @returns true se o WAHA aceitou o envio; false em qualquer outro caso.
 */
export async function sendWhatsAppText(
  text: string,
  recipient?: string
): Promise<boolean> {
  return post('sendText', { text }, SEND_TIMEOUT_MS, recipient)
}

function isVideoUrl(url: string): boolean {
  return /\.(mp4|mov|avi|webm)(\?.*)?$/i.test(url)
}

/**
 * Envia um DOCUMENTO (PDF por padrão) pelo WhatsApp. A URL precisa ser pública
 * (as nossas ficam no Vercel Blob): o WAHA a baixa.
 */
export async function sendWhatsAppDocument(
  mediaUrl: string,
  options?: { caption?: string; recipient?: string; fileName?: string; mimetype?: string }
): Promise<boolean> {
  return post(
    'sendFile',
    {
      file: {
        url: mediaUrl,
        mimetype: options?.mimetype ?? 'application/pdf',
        filename: options?.fileName ?? 'documento.pdf',
      },
      ...(options?.caption ? { caption: options.caption } : {}),
    },
    SEND_MEDIA_TIMEOUT_MS,
    options?.recipient
  )
}

/**
 * Envia uma imagem ou vídeo pelo WhatsApp. O WAHA baixa a mídia da URL, que
 * por isso precisa ser pública — as nossas ficam no Vercel Blob.
 *
 * @param caption Texto que acompanha a mídia (opcional).
 */
export async function sendWhatsAppMedia(
  mediaUrl: string,
  options?: { caption?: string; recipient?: string; fileName?: string }
): Promise<boolean> {
  const isVideo = isVideoUrl(mediaUrl)

  return post(
    isVideo ? 'sendVideo' : 'sendImage',
    {
      file: {
        url: mediaUrl,
        mimetype: isVideo ? 'video/mp4' : 'image/jpeg',
        filename: options?.fileName || (isVideo ? 'arte.mp4' : 'arte.jpg'),
      },
      ...(options?.caption ? { caption: options.caption } : {}),
    },
    SEND_MEDIA_TIMEOUT_MS,
    options?.recipient
  )
}
