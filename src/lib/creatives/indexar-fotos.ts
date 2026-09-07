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

/**
 * Miniatura `=s400` + o md5 do arquivo, na MESMA ida ao Drive.
 *
 * 🔴 `files.list` NÃO devolve `md5Checksum` neste acervo (medido em
 * 07/09/2026: 245 fotos listadas, zero com hash, embora o `fields` o peça e o
 * `files.get` do mesmo arquivo o devolva). É por isso que o backfill da
 * reconciliação nunca preencheu nada e `md5` está vazio em 100% das entradas.
 * Aqui o hash vem de graça no `get` que já buscava o thumbnail.
 */
async function baixarMiniatura(fileId: string): Promise<{ buffer: Buffer; md5: string | null }> {
  const meta = await googleDriveService.getFileMetadata(fileId, 'thumbnailLink, md5Checksum')
  const link = typeof meta.thumbnailLink === 'string' ? meta.thumbnailLink.replace(/=s\d+$/, '=s400') : null
  if (!link) throw new Error('sem thumbnailLink')
  const r = await fetch(link)
  if (!r.ok) throw new Error(`miniatura HTTP ${r.status}`)
  return { buffer: Buffer.from(await r.arrayBuffer()), md5: typeof meta.md5Checksum === 'string' ? meta.md5Checksum : null }
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
      // Miniaturas em PARALELO dentro do lote (a ida ao Drive é o gargalo:
      // em série eram ~45 fotos/min). Quem falha no download sai do lote.
      const prontas: Array<{ entrada: EntradaParaIndexar; imagem: ImagemParaEmbedar; md5: string | null }> = []
      await Promise.all(
        lote.map(async (entrada) => {
          try {
            const baixada = entrada.miniatura
              ? { buffer: entrada.miniatura, md5: entrada.md5 ?? null }
              : await baixarMiniatura(entrada.driveFileId)
            prontas.push({
              entrada,
              imagem: { mimeType: mimeDe(baixada.buffer), base64: baixada.buffer.toString('base64') },
              md5: baixada.md5 ?? entrada.md5 ?? null,
            })
          } catch (erro) {
            falhas++
            console.warn(`[indexar-fotos] ${projectId}/${entrada.driveFileId}: miniatura falhou — ${String((erro as Error)?.message ?? erro)}`)
          }
        }),
      )
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
            md5: p.md5,
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
