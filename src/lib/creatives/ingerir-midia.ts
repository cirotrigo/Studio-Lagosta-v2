/**
 * Ingestão da mídia de um post para o Blob do Studio.
 *
 * Agendar com `mediaUrls` apontando para um CDN de terceiro (o CloudFront do
 * Higgsfield, o link temporário de um gerador de imagem) grava na agenda uma
 * arte que não é nossa. Isso quebra em três lugares, e os três já aconteceram:
 *
 *  1. A agenda não mostra a capa. O `next/image` só otimiza host declarado em
 *     `images.remotePatterns` (next.config.ts) e devolve 400 para o resto — o
 *     post aparece na grade sem arte nenhuma.
 *  2. O post não pode voltar para rascunho. `midiaSobreviveAoZernio` trata todo
 *     host desconhecido como CDN do Zernio e recusa o revert, porque apagar o
 *     post de lá levaria a arte junto.
 *  3. A publicação depende de um link que não controlamos continuar de pé até
 *     a hora marcada. CDN de gerador expira; a agenda descobre no ar.
 *
 * A correção é na entrada: o que não estiver num host próprio é baixado e
 * republicado no Blob ANTES de virar `mediaUrls`. Daí para frente todo post
 * nasce com mídia nossa, e os três problemas somem de uma vez.
 */

import { put } from '@vercel/blob'
import { fetchBuffer } from '@/lib/posts/register-project-fonts'

/**
 * Hosts cuja mídia é nossa (ou tão estável quanto): o Blob do Studio, o CDN do
 * Drive e o Supabase do Claudinho. Precisa casar com a lista de
 * `agenda-acoes.ts` — é a mesma pergunta ("essa arte sobrevive?") feita na
 * entrada em vez da saída, e as duas divergirem traria de volta o revert
 * bloqueado que a ingestão existe para evitar.
 */
export const HOSTS_PROPRIOS = [
  '.public.blob.vercel-storage.com',
  'lh3.googleusercontent.com',
  '.supabase.co',
]

export function ehHostProprio(url: string): boolean {
  return HOSTS_PROPRIOS.some((host) => url.includes(host))
}

/** 25MB: o mesmo teto de arte-enviada e do envio pelo celular. */
const MAX_MIDIA_BYTES = 25 * 1024 * 1024

const CONTENT_TYPE_POR_EXT: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  mp4: 'video/mp4',
  mov: 'video/quicktime',
}

/**
 * Extensão pelo caminho da URL, ignorando query string (o link assinado de CDN
 * sempre traz uma). Sem extensão reconhecida, PNG: é o que os geradores de arte
 * devolvem, e o Blob precisa de um content-type para servir a imagem inline em
 * vez de forçar download.
 */
function extensaoDaUrl(url: string): string {
  const caminho = url.split('?')[0]
  const ext = caminho.split('.').pop()?.toLowerCase() ?? ''
  return ext in CONTENT_TYPE_POR_EXT ? ext : 'png'
}

export interface IngestaoResultado {
  /** As URLs finais, na mesma ordem da entrada. */
  urls: string[]
  /** Quantas foram efetivamente baixadas e republicadas. */
  importadas: number
  /**
   * URLs externas que não deu para trazer. Ficam com o endereço original: o
   * post com capa que talvez quebre é melhor que o agendamento que falha, e o
   * chamador recebe o motivo para avisar.
   */
  falhas: { url: string; motivo: string }[]
}

/**
 * Traz para o Blob toda URL que não seja de host próprio.
 *
 * Idempotente na prática: URL que já é do Blob volta intacta, então repetir a
 * ingestão sobre a mesma lista não duplica arquivo.
 */
export async function ingerirMidiaExterna(
  mediaUrls: string[],
  projectId: number,
): Promise<IngestaoResultado> {
  const falhas: IngestaoResultado['falhas'] = []
  let importadas = 0

  const urls = await Promise.all(
    mediaUrls.map(async (url) => {
      if (!url || url.startsWith('data:') || ehHostProprio(url)) return url

      try {
        const buffer = await fetchBuffer(url)
        if (buffer.length === 0) {
          throw new Error('resposta vazia')
        }
        if (buffer.length > MAX_MIDIA_BYTES) {
          throw new Error(`${Math.round(buffer.length / 1024 / 1024)}MB (limite 25MB)`)
        }

        const ext = extensaoDaUrl(url)
        // Sufixo aleatório: o mesmo criativo pode ser agendado em dois horários
        // e sem ele o segundo `put` seria recusado pelo caminho repetido.
        const blob = await put(`agenda-midia/${projectId}/midia.${ext}`, buffer, {
          access: 'public',
          contentType: CONTENT_TYPE_POR_EXT[ext],
          addRandomSuffix: true,
        })
        importadas += 1
        return blob.url
      } catch (error) {
        const motivo = (error as Error).message
        console.error('[agenda] falha ao trazer mídia externa para o Blob:', url, motivo)
        falhas.push({ url, motivo })
        return url
      }
    }),
  )

  return { urls, importadas, falhas }
}
