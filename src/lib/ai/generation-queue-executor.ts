/**
 * Quem tira o job da fila e roda o pipeline.
 *
 * Separado de `generation-queue.ts` porque este módulo importa os dois
 * runners, e os runners importam `pedirNovaTentativa` da fila — juntos, seria
 * um ciclo de import.
 *
 * Duas portas de entrada:
 *
 * 1. `processarLoteDaFila` — o cron. É a garantia: o que estiver na fila sai,
 *    mesmo que a invocação que pediu a arte já tenha morrido.
 * 2. `dispararJobAgora` — o atalho das ROTAS HTTP, dentro de `after()`. Cada
 *    POST da bancada é UM job na SUA invocação, então rodar na hora não
 *    disputa teto com ninguém e mantém a latência que a tela já tinha (o
 *    acompanhamento do cliente desiste em 8 minutos). O job continua no banco,
 *    reservado — se a invocação morrer, a varredura recupera.
 *
 * ⚠️ O MCP NÃO usa o atalho, de propósito: lá uma invocação pode carregar
 * várias tools (batch JSON-RPC com Promise.all) e `confirmar-estilo-carrossel`
 * sozinha dispara até 6 gerações. Era exatamente essa soma que estourava o
 * `maxDuration = 300`.
 */

import { processArtGenerationInBackground, type ArtGenerationJobArgs } from '@/lib/ai/creative-generation-runner'
import { processImprovementInBackground, type ImprovementJobArgs } from '@/lib/ai/creative-improvement-runner'
import {
  buscarJob,
  falharJob,
  fecharJob,
  proximosJobs,
  recuperarJobsPerdidos,
  reservarJob,
  type JobParaExecutar,
} from '@/lib/ai/generation-queue'

/**
 * Quantos jobs uma varredura pega. Cada um leva ~2 minutos e roda em paralelo
 * (o gargalo é a API de imagem, não a CPU); com o cron de minuto em minuto,
 * uma leva de 7 artes sai bem dentro dos 8 minutos que a bancada espera.
 */
export const LOTE_POR_VARREDURA = 3

export interface ResultadoDaVarredura {
  reservados: number
  concluidos: number
  falhados: number
  reenfileirados: number
  recuperados: { reenfileirados: number; falhados: number; orfasSemJob: number }
}

/** Uma passada da fila: recupera o que se perdeu, depois executa o lote. */
export async function processarLoteDaFila(limite = LOTE_POR_VARREDURA): Promise<ResultadoDaVarredura> {
  const recuperados = await recuperarJobsPerdidos()

  const candidatos = await proximosJobs(limite)
  if (candidatos.length === 0) {
    return { reservados: 0, concluidos: 0, falhados: 0, reenfileirados: 0, recuperados }
  }

  const desfechos = await Promise.all(candidatos.map((job) => executarJob(job)))

  return {
    reservados: desfechos.filter((d) => d !== 'ocupado').length,
    concluidos: desfechos.filter((d) => d === 'DONE').length,
    falhados: desfechos.filter((d) => d === 'FAILED').length,
    reenfileirados: desfechos.filter((d) => d === 'REENFILEIRADO').length,
    recuperados,
  }
}

type Desfecho = 'DONE' | 'FAILED' | 'REENFILEIRADO' | 'ocupado'

/**
 * Reserva e executa UM job. A reserva é compare-and-set: perder a corrida para
 * outra varredura não é erro, é o mecanismo funcionando.
 */
async function executarJob(job: JobParaExecutar): Promise<Desfecho> {
  const pegou = await reservarJob(job.id)
  if (!pegou) return 'ocupado'

  const t0 = Date.now()
  console.log(
    `[fila-arte] executando ${job.kind} ${job.id} (generation ${job.generationId}, tentativa ${job.attempts + 1}/${job.maxAttempts})`,
  )

  try {
    await rodarRunner(job)
  } catch (erro) {
    // Os runners engolem o próprio erro e gravam FAILED na Generation; chegar
    // aqui significa erro ANTES do pipeline (payload corrompido, import).
    const msg = erro instanceof Error ? erro.message : String(erro)
    console.error(`[fila-arte] job ${job.id} estourou fora do pipeline:`, msg)
    await falharJob(job.id, msg)
    return 'FAILED'
  }

  const desfecho = await fecharJob(job.id, job.generationId)
  console.log(`[fila-arte] job ${job.id} → ${desfecho} em ${Math.round((Date.now() - t0) / 1000)}s`)
  return desfecho
}

/** Dispatch por tipo. O `queueJobId` é o que deixa o runner pedir outra tentativa. */
async function rodarRunner(job: JobParaExecutar): Promise<void> {
  if (job.kind === 'ARTE') {
    const args = job.payload as ArtGenerationJobArgs
    await processArtGenerationInBackground({ ...args, queueJobId: job.id })
    return
  }
  const args = job.payload as ImprovementJobArgs
  await processImprovementInBackground({ ...args, queueJobId: job.id })
}

/**
 * Atalho das rotas HTTP: pega o job recém-enfileirado e roda JÁ, nesta
 * invocação. Silencioso quando a varredura chegou antes — o trabalho vai sair
 * de um jeito ou de outro.
 */
export async function dispararJobAgora(jobId: string): Promise<void> {
  const job = await buscarJob(jobId)
  if (!job) {
    console.warn(`[fila-arte] job ${jobId} sumiu antes do disparo imediato — a varredura pega o que sobrar`)
    return
  }
  await executarJob(job)
}
