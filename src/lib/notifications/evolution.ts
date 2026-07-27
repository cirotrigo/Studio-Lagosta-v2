/**
 * Cliente mínimo da Evolution API (WhatsApp) para avisos internos da equipe.
 *
 * Regra de ouro: notificação NUNCA derruba o fluxo que a chamou. Todo erro é
 * logado e engolido — uma publicação não pode falhar porque o WhatsApp estava
 * fora do ar. Por isso `sendWhatsAppText` devolve boolean em vez de lançar.
 *
 * Envio de texto na Evolution v2:
 *   POST {EVOLUTION_API_URL}/message/sendText/{EVOLUTION_INSTANCE}
 *   header: apikey
 *   body:   { number, text }
 *
 * Para grupo, `number` é o JID do grupo (termina em `@g.us`).
 */

const SEND_TIMEOUT_MS = 10_000

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
  const config = readConfig()

  if (!config) {
    console.warn(
      '[Evolution] Notificação ignorada: configure EVOLUTION_API_URL, EVOLUTION_API_KEY, EVOLUTION_INSTANCE e EVOLUTION_NOTIFY_GROUP_ID'
    )
    return false
  }

  const number = recipient?.trim() || config.defaultRecipient
  const endpoint = `${config.apiUrl}/message/sendText/${encodeURIComponent(config.instance)}`

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: config.apiKey,
      },
      body: JSON.stringify({ number, text }),
      signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
    })

    if (!response.ok) {
      const body = await response.text().catch(() => '')
      console.error(
        `[Evolution] Envio recusado (HTTP ${response.status}) para ${number}:`,
        sanitize(body.slice(0, 500), config.apiKey)
      )
      return false
    }

    console.log(`[Evolution] ✅ Aviso enviado para ${number}`)
    return true
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error(
      `[Evolution] Falha ao enviar aviso para ${number}:`,
      sanitize(message, config.apiKey)
    )
    return false
  }
}
