/**
 * A leitura das imagens do Blob numa prova de integração que COMPÕE peças pela
 * fila real — só para prova, nunca importe isto de `src/`.
 *
 * O domínio público do Blob levanta o "Vercel Security Checkpoint" (403 para
 * TODA URL, por alguns minutos) quando esta máquina faz muitas idas em pouco
 * tempo, e cada composição busca a foto e a logo lá várias vezes (a régua
 * renderiza de novo sem os textos). Medido na prova-dev-4 do PR 11
 * (13/09/2026): a 9ª composição da rodada parou em "Failed to load image" da
 * logo com 403, o job voltou à fila, e a prova leu a peça PROCESSING e o item
 * `na-fila` como defeito do código.
 *
 * O que a prova prova é a composição, não a disponibilidade do Blob: neste
 * processo, cada imagem do Blob é baixada UMA vez por URL (a URL do Blob leva
 * sufixo aleatório, o conteúdo dela não muda), com nova tentativa espaçada em
 * 403/429/5xx. Mesmo desenho da prova do revisor
 * (`scripts/validar-revisor-da-arte.ts`, provas 29 a 33).
 */

const HOST_DO_BLOB = /^https:\/\/[^/]+\.public\.blob\.vercel-storage\.com\//
const ESPERAS_DO_BLOB = [20_000, 45_000, 90_000, 120_000]

export async function lerOBlobUmaVezPorUrl(rotulo: string): Promise<void> {
  const { CanvasRenderer } = await import('../../src/lib/canvas-renderer')
  const { loadImage } = await import('@napi-rs/canvas')
  const prototipo = CanvasRenderer.prototype as unknown as { nodeImageLoader?: (url: string) => Promise<unknown> }
  const carregarOriginal = prototipo.nodeImageLoader
  if (typeof carregarOriginal !== 'function') {
    throw new Error('CanvasRenderer.nodeImageLoader não existe mais: a leitura do Blob das provas precisa ser refeita.')
  }

  const baixar = async (url: string): Promise<Buffer> => {
    for (let tentativa = 0; ; tentativa++) {
      const r = await fetch(url, { headers: { 'user-agent': `studio-lagosta-prova/1.0 (${rotulo})` } })
      if (r.ok) return Buffer.from(await r.arrayBuffer())
      if (![403, 429, 500, 502, 503, 504].includes(r.status) || tentativa >= ESPERAS_DO_BLOB.length) throw new Error(`o Blob respondeu ${r.status}`)
      console.log(`  (Blob ${r.status} em ${url.split('/').pop()} — nova tentativa em ${ESPERAS_DO_BLOB[tentativa] / 1000}s)`)
      await new Promise((pronto) => setTimeout(pronto, ESPERAS_DO_BLOB[tentativa]))
    }
  }
  const bytesDoBlob = new Map<string, Promise<Buffer>>()
  prototipo.nodeImageLoader = async function (this: unknown, url: string) {
    if (!HOST_DO_BLOB.test(url)) return carregarOriginal.call(this, url)
    let bytes = bytesDoBlob.get(url)
    if (!bytes) {
      bytes = baixar(url)
      bytesDoBlob.set(url, bytes)
      bytes.catch(() => bytesDoBlob.delete(url))
    }
    try {
      return await loadImage(await bytes)
    } catch (erro) {
      console.error('[prova] imagem do Blob indisponível:', url, erro)
      throw new Error(`Failed to load image: ${url}`)
    }
  }
}
