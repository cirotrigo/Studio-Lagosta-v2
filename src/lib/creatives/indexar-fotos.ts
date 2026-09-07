/**
 * Indexa fotos do catálogo em `PhotoEmbedding` — o passo comum ao script de
 * carga inicial e ao cron `reconciliar-catalogos` (que indexa a foto NOVA no
 * mesmo passo em que a cataloga).
 *
 * Por foto: miniatura `=s400` do Drive (a mesma que a visão lê; quem já a tem
 * em mãos passa `miniatura` e poupa a ida) → vetor da imagem + vetor do
 * texto do catálogo → upsert. Falha de UMA foto conta e segue; nada aqui
 * derruba quem chama.
 */

import { googleDriveService } from '@/server/google-drive-service'
import {
  embedarImagens,
  embedarTextos,
  gravarEmbeddingsDeFoto,
  textoDaFotoParaEmbedding,
  type ImagemParaEmbedar,
} from './embeddings-de-foto'

export interface EntradaParaIndexar {
  driveFileId: string
  md5?: string | null
  description?: string | null
  tags?: string[] | null
  bestFor?: string[] | null
  menuItem?: string | null
  folder?: string | null
  /** A miniatura já baixada (JPEG/PNG), quando o chamador a tem. */
  miniatura?: Buffer | null
}

export interface ResultadoDaIndexacao {
  gravadas: number
  falhas: number
}

async function baixarMiniatura(fileId: string): Promise<Buffer> {
  const meta = await googleDriveService.getFileMetadata(fileId, 'thumbnailLink')
  const link = typeof meta.thumbnailLink === 'string' ? meta.thumbnailLink.replace(/=s\d+$/, '=s400') : null
  if (!link) throw new Error('sem thumbnailLink')
  const r = await fetch(link)
  if (!r.ok) throw new Error(`miniatura HTTP ${r.status}`)
  return Buffer.from(await r.arrayBuffer())
}

function mimeDe(buffer: Buffer): ImagemParaEmbedar['mimeType'] {
  return buffer[0] === 0x89 && buffer[1] === 0x50 ? 'image/png' : 'image/jpeg'
}

/** Indexa em lotes de 6 (o teto da API por chamada), `concorrencia` lotes em voo. */
export async function indexarFotosDoCatalogo(input: {
  projectId: number
  entradas: EntradaParaIndexar[]
  concorrencia?: number
  /** Epoch ms: para de pegar lote novo depois disto (o cron tem orçamento). */
  prazoEm?: number
  aoProgredir?: (feitas: number, total: number) => void
}): Promise<ResultadoDaIndexacao> {
  const { projectId, entradas } = input
  const concorrencia = Math.max(1, input.concorrencia ?? 2)
  const prazoEm = input.prazoEm ?? Number.POSITIVE_INFINITY
  const lotes: EntradaParaIndexar[][] = []
  for (let i = 0; i < entradas.length; i += 6) lotes.push(entradas.slice(i, i + 6))

  let gravadas = 0
  let falhas = 0
  let feitas = 0
  let proximo = 0

  const worker = async () => {
    while (proximo < lotes.length) {
      if (Date.now() > prazoEm) return
      const lote = lotes[proximo++]
      // Miniaturas: quem falha no download sai do lote (conta como falha).
      const prontas: Array<{ entrada: EntradaParaIndexar; imagem: ImagemParaEmbedar }> = []
      for (const entrada of lote) {
        try {
          const buffer = entrada.miniatura ?? (await baixarMiniatura(entrada.driveFileId))
          prontas.push({ entrada, imagem: { mimeType: mimeDe(buffer), base64: buffer.toString('base64') } })
        } catch (erro) {
          falhas++
          console.warn(`[indexar-fotos] ${projectId}/${entrada.driveFileId}: miniatura falhou — ${String((erro as Error)?.message ?? erro)}`)
        }
      }
      if (prontas.length === 0) { feitas += lote.length; input.aoProgredir?.(feitas, entradas.length); continue }
      try {
        const textos = prontas.map((p) => textoDaFotoParaEmbedding(p.entrada))
        const [vImagens, vTextos] = await Promise.all([
          embedarImagens(prontas.map((p) => p.imagem)),
          embedarTextos(textos.map((t) => (t.trim() ? t : 'foto de restaurante'))),
        ])
        gravadas += await gravarEmbeddingsDeFoto(
          projectId,
          prontas.map((p, i) => ({
            driveFileId: p.entrada.driveFileId,
            md5: p.entrada.md5 ?? null,
            vetorImagem: vImagens[i],
            vetorTexto: vTextos[i],
            texto: textos[i],
          })),
        )
      } catch (erro) {
        falhas += prontas.length
        console.warn(`[indexar-fotos] ${projectId}: lote falhou — ${String((erro as Error)?.message ?? erro)}`)
      }
      feitas += lote.length
      input.aoProgredir?.(feitas, entradas.length)
    }
  }

  await Promise.all(Array.from({ length: Math.min(concorrencia, lotes.length) }, worker))
  return { gravadas, falhas }
}
