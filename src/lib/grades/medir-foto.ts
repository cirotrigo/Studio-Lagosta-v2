/**
 * Medidor das dimensões naturais de uma foto pelo navegador, com PRAZO e cancelamento: medida que nunca termina não
 * prende botão nem lote (G1 inserir e G2 preencher usam o mesmo). Quem usa confere a URL exata do resultado com
 * `dimensoesDaFotoCarregada` (image-fit). Só no cliente: usa `window.Image`.
 */
export const PRAZO_DA_MEDIDA_MS = 20_000

export type MedidorDeFoto = (url: string, opcoes?: { prazoMs?: number; signal?: AbortSignal }) => Promise<{ src: string; width: number; height: number }>

export const medirFotoNoNavegador: MedidorDeFoto = (url, { prazoMs = PRAZO_DA_MEDIDA_MS, signal } = {}) =>
  new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new Error('Medida cancelada.'))
    const img = new window.Image()
    const encerrar = (fim: () => void) => {
      clearTimeout(prazo)
      signal?.removeEventListener('abort', cancelar)
      img.onload = null
      img.onerror = null
      fim()
    }
    const cancelar = () => encerrar(() => reject(new Error('Medida cancelada.')))
    const prazo = setTimeout(() => encerrar(() => reject(new Error('A foto demorou demais para carregar.'))), prazoMs)
    signal?.addEventListener('abort', cancelar, { once: true })
    img.onload = () => encerrar(() => resolve({ src: img.src, width: img.naturalWidth, height: img.naturalHeight }))
    img.onerror = () => encerrar(() => reject(new Error('A foto não carregou.')))
    img.src = url
  })
