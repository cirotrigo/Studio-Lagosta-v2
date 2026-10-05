/**
 * As etapas do processador de vídeo que precisam de prova sem banco nem
 * ffmpeg: a do MP4 (o marcador logo depois do upload, e só se apaga arquivo
 * comprovadamente órfão) e a falha definitiva (job e Generation num commit).
 * O processador (`process-video-job.ts`) passa os efeitos de verdade.
 */
import type { Prisma } from '../../../prisma/generated/client'
import { mesclarFieldValuesDaArte } from '@/lib/creatives/mesclar-field-values'

/**
 * Grava o registro que passa a apontar para arquivos que esta execução acabou
 * de subir. Se a escrita falhar, relê: o registro aponta para todos → a escrita
 * aconteceu e só a confirmação se perdeu (segue); não aponta → os que ficaram
 * de fora são órfãos comprovados, são apagados, e o erro sobe. Sem conseguir
 * reler não há prova — nada é apagado (sobra no Blob é melhor que vídeo de um
 * job apagado).
 */
export async function gravarApontandoPara(p: {
  arquivos: string[]
  gravar: () => Promise<unknown>
  apontados: () => Promise<Array<string | null | undefined>>
  apagar: (url: string) => Promise<unknown>
}): Promise<void> {
  try {
    await p.gravar()
  } catch (erro) {
    if (p.arquivos.length === 0) throw erro
    let hoje: Array<string | null | undefined>
    try {
      hoje = await p.apontados()
    } catch {
      throw erro
    }
    const orfaos = p.arquivos.filter((url) => !hoje.includes(url))
    if (orfaos.length === 0) return
    await Promise.all(orfaos.map((url) => p.apagar(url).catch(() => {})))
    throw erro
  }
}

/**
 * A etapa do MP4: sobe o vídeo, grava o marcador LOGO em seguida e só então
 * roda os auxiliares (miniatura e backup no Drive). Antes o marcador vinha
 * depois deles: uma queda no backup deixava o MP4 no Blob sem ninguém
 * apontando para ele, e a repetição convertia e subia outro.
 */
export async function etapaDoMp4(p: {
  subirMp4: () => Promise<string>
  gravarMarcador: (url: string) => Promise<unknown>
  marcadorAtual: () => Promise<string | null | undefined>
  apagar: (url: string) => Promise<unknown>
  auxiliares: (url: string) => Promise<void>
}): Promise<string> {
  const url = await p.subirMp4()
  await gravarApontandoPara({
    arquivos: [url],
    gravar: () => p.gravarMarcador(url),
    apontados: async () => [await p.marcadorAtual()],
    apagar: p.apagar,
  })
  await p.auxiliares(url)
  return url
}

type ClienteComTransacao = {
  $transaction<T>(
    fazer: (tx: Prisma.TransactionClient) => Promise<T>,
    opcoes?: { maxWait?: number; timeout?: number },
  ): Promise<T>
}

/**
 * A falha DEFINITIVA de um job de vídeo: o job vira FAILED (só se ainda está
 * como quem chama o leu) e a Generation dele também, no MESMO commit. Em dois
 * commits, uma queda no meio deixava o job terminal e a Generation em produção
 * para sempre — fora do alcance da recuperação, que só olha jobs PROCESSING.
 * Devolve se a falha foi gravada.
 */
export async function finalizarFalhaDoVideo(
  client: ClienteComTransacao,
  p: {
    onde: { id: string; status: 'PROCESSING'; startedAt: Date | null }
    generationId: string | null
    errorMessage: string
    /** Só quem a tem: a fila devolve a miniatura do pedido ao card da galeria. */
    resultUrl?: string | null
  },
): Promise<boolean> {
  return client.$transaction(async (tx) => {
    const r = await tx.videoProcessingJob.updateMany({
      where: p.onde,
      data: { status: 'FAILED', errorMessage: p.errorMessage },
    })
    if (r.count !== 1) return false
    if (p.generationId) {
      await mesclarFieldValuesDaArte(tx, p.generationId, { progress: 100, errorMessage: p.errorMessage })
      await tx.generation.update({
        where: { id: p.generationId },
        data: { status: 'FAILED', ...(p.resultUrl !== undefined ? { resultUrl: p.resultUrl } : {}) },
      })
    }
    return true
  }, { maxWait: 10_000, timeout: 20_000 })
}
