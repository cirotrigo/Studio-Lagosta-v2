/**
 * Fila durável da geração de arte por IA (F0.3) — as operações de banco.
 *
 * Antes disto o trabalho pesado rodava no `after()` da MESMA invocação que o
 * pediu. Uma arte chega a ~290s no pior caso contra o teto de 300s da rota, e
 * o MCP piora: `confirmar-estilo-carrossel` dispara até 6 `after()` sob o
 * MESMO teto, e o batch JSON-RPC resolve várias tools com `Promise.all`.
 * Quando a invocação morria, a Generation ficava PROCESSING para sempre —
 * não havia recuperação nenhuma.
 *
 * "after() encadeado" foi avaliado e RISCADO no plano: `after()` morre com a
 * invocação, que é exatamente o cenário de falha.
 *
 * ⚠️ REGRA DA CASA (renderPostArt): a reserva olha SÓ o status. Os portões de
 * tentativa (`attempts < maxAttempts`) e de tempo (`nextAttemptAt <= agora`)
 * vivem NA QUERY DE QUEM VARRE — ver `proximosJobs`. Chamador novo que esqueça
 * os portões queima as tentativas em minutos e marca falha terminal.
 *
 * Este módulo NÃO importa os runners: quem executa é
 * `generation-queue-executor.ts`. É o que evita o ciclo de import, já que os
 * dois runners precisam de `pedirNovaTentativa` daqui.
 */

import { db } from '@/lib/db'
import type { ArtGenerationJobArgs } from '@/lib/ai/creative-generation-runner'
import type { ImprovementJobArgs } from '@/lib/ai/creative-improvement-runner'

/**
 * Quanto tempo uma invocação segura o job antes de ele ser dado como morto.
 *
 * É o "sem update há mais de 10 min" do plano: o trabalho cabe em 300s, então
 * 10 minutos é folga de sobra para um fim lento e curto o bastante para o
 * usuário não ficar esperando a vida inteira.
 */
export const LEASE_MS = 10 * 60_000

/**
 * Idade a partir da qual uma Generation PROCESSING **sem job** é dada como
 * abandonada. Cobre as órfãs que já existem hoje em produção, criadas antes
 * desta fila existir.
 */
export const ORFA_SEM_JOB_MS = 10 * 60_000

/** Espera antes de reexecutar um job cuja invocação morreu. */
const BACKOFF_APOS_MORTE_MS = 60_000

export type GenerationJobKind = 'ARTE' | 'MELHORIA' | 'COMPOR'

export interface JobParaExecutar {
  id: string
  generationId: string
  kind: GenerationJobKind
  payload: unknown
  attempts: number
  maxAttempts: number
}

/**
 * Põe a geração de arte na fila. Idempotente por `generationId` (UNIQUE):
 * chamar duas vezes para a mesma Generation devolve o job que já existe, em
 * vez de criar um segundo — que viraria arte (e cobrança) em dobro.
 */
export async function enfileirarArte(args: ArtGenerationJobArgs): Promise<string> {
  return enfileirar('ARTE', args.jobGenerationId, args.projectId, args)
}

/** Irmão do acima para a melhoria de criativo. */
export async function enfileirarMelhoria(args: ImprovementJobArgs): Promise<string> {
  return enfileirar('MELHORIA', args.jobGenerationId, args.projectId, args)
}

/**
 * Composição pelo editor (F3 do editor-como-usina). Sem chamada paga: é
 * render de ~3-5s, e por isso a varredura pega um LOTE dela depois dos jobs
 * de IA (ver `processarLoteDaFila`). `maxAttempts` 3: tentar de novo custa
 * só CPU.
 */
export async function enfileirarComposicao(args: ComposicaoJobArgs): Promise<string> {
  const limpo = JSON.parse(JSON.stringify(args)) as Record<string, unknown>
  const job = await db.generationJob.upsert({
    where: { generationId: args.generationId },
    create: { generationId: args.generationId, kind: 'COMPOR', projectId: args.projectId, payload: limpo as never, maxAttempts: 3 },
    update: {},
    select: { id: true },
  })
  return job.id
}

/** O payload de um job COMPOR — o que `processarComposicaoEmBackground` recebe. */
export interface ComposicaoJobArgs {
  generationId: string
  projectId: number
  /** A spec validada (`src/lib/compositor/spec.ts`). */
  spec: unknown
  decididoPor?: string | null
  /** Quem assina a arte (User.id interno); sem isso, o dono do projeto. */
  autor?: string | null
}

async function enfileirar(
  kind: GenerationJobKind,
  generationId: string,
  projectId: number,
  payload: unknown,
): Promise<string> {
  // JSON.parse(JSON.stringify(...)) derruba `undefined` e datas viram string —
  // é exatamente o que precisa acontecer, porque o payload volta do banco
  // deserializado quando OUTRA invocação executar o job.
  const limpo = JSON.parse(JSON.stringify(payload)) as Record<string, unknown>

  const job = await db.generationJob.upsert({
    where: { generationId },
    create: { generationId, kind, projectId, payload: limpo as never },
    // Job que já existe não é reescrito: se ele está RUNNING, sobrescrever o
    // payload seria trocar o chão de quem está trabalhando.
    update: {},
    select: { id: true },
  })
  return job.id
}

/**
 * Os próximos jobs elegíveis, com os DOIS portões na query (ver o aviso no
 * topo do arquivo). Ordem de chegada — quem pediu primeiro é atendido primeiro.
 */
export async function proximosJobs(limite: number, kinds?: GenerationJobKind[]): Promise<JobParaExecutar[]> {
  const agora = new Date()
  const jobs = await db.generationJob.findMany({
    where: {
      status: 'PENDING',
      nextAttemptAt: { lte: agora },
      ...(kinds && kinds.length > 0 ? { kind: { in: kinds } } : {}),
      // Portão de tentativa. Sem ele, um job que sempre falha volta à fila
      // para sempre — cada volta é uma chamada paga do modelo.
      attempts: { lt: db.generationJob.fields.maxAttempts },
    },
    orderBy: { nextAttemptAt: 'asc' },
    take: limite,
    select: {
      id: true,
      generationId: true,
      kind: true,
      payload: true,
      attempts: true,
      maxAttempts: true,
    },
  })
  return jobs as JobParaExecutar[]
}

/** Um job pelo id — o atalho das rotas, que já sabem qual acabaram de criar. */
export async function buscarJob(id: string): Promise<JobParaExecutar | null> {
  const job = await db.generationJob.findUnique({
    where: { id },
    select: {
      id: true,
      generationId: true,
      kind: true,
      payload: true,
      attempts: true,
      maxAttempts: true,
    },
  })
  return (job as JobParaExecutar | null) ?? null
}

/**
 * Reserva o job para esta invocação (PENDING → RUNNING), com arrendamento.
 *
 * Compare-and-set em vez de update cru, como em `renderPostArt`: duas
 * varreduras concorrentes chegariam ao mesmo job e as duas gerariam a mesma
 * arte, pagando duas vezes.
 */
export async function reservarJob(id: string): Promise<boolean> {
  const agora = new Date()
  const r = await db.generationJob.updateMany({
    where: { id, status: 'PENDING' },
    data: {
      status: 'RUNNING',
      startedAt: agora,
      leaseExpiresAt: new Date(agora.getTime() + LEASE_MS),
      attempts: { increment: 1 },
    },
  })
  return r.count > 0
}

/**
 * Devolve o job à fila para OUTRA invocação — é assim que a segunda geração
 * acontece.
 *
 * Chamado de dentro dos runners quando o resultado precisa ser refeito
 * (proporção errada na geração, texto divergente na melhoria). Devolve `false`
 * quando não há mais tentativas, e aí quem chamou decide o desfecho: a
 * Generation continua sendo dele.
 */
export async function pedirNovaTentativa(
  queueJobId: string | null | undefined,
  motivo: string,
): Promise<boolean> {
  if (!queueJobId) return false

  const job = await db.generationJob.findUnique({
    where: { id: queueJobId },
    select: { attempts: true, maxAttempts: true, status: true },
  })
  if (!job || job.status !== 'RUNNING') return false
  if (job.attempts >= job.maxAttempts) return false

  const r = await db.generationJob.updateMany({
    where: { id: queueJobId, status: 'RUNNING' },
    data: {
      status: 'PENDING',
      // Sem espera: a pessoa está olhando a bancada, e a próxima varredura é
      // em no máximo um minuto.
      nextAttemptAt: new Date(),
      leaseExpiresAt: null,
      lastError: motivo.slice(0, 500),
    },
  })
  return r.count > 0
}

/**
 * Fecha o job depois da execução, lendo o desfecho na Generation — que é quem
 * sabe se a arte saiu. Os runners engolem o próprio erro e gravam
 * COMPLETED/FAILED lá; aqui só espelhamos.
 */
export async function fecharJob(id: string, generationId: string): Promise<'DONE' | 'FAILED' | 'REENFILEIRADO'> {
  const job = await db.generationJob.findUnique({ where: { id }, select: { status: true } })
  // O runner pediu outra tentativa: o job já voltou para PENDING e não é
  // nosso para fechar.
  if (job?.status === 'PENDING') return 'REENFILEIRADO'

  const gen = await db.generation.findUnique({
    where: { id: generationId },
    select: { status: true, fieldValues: true },
  })
  const ok = gen?.status === 'COMPLETED'
  const erro =
    !ok && gen?.fieldValues && typeof gen.fieldValues === 'object'
      ? String((gen.fieldValues as Record<string, unknown>).error ?? '').slice(0, 500)
      : null

  await db.generationJob.updateMany({
    where: { id, status: 'RUNNING' },
    data: {
      status: ok ? 'DONE' : 'FAILED',
      finishedAt: new Date(),
      leaseExpiresAt: null,
      ...(erro ? { lastError: erro } : {}),
    },
  })
  return ok ? 'DONE' : 'FAILED'
}

/** Marca o job como falho sem consultar a Generation (erro do próprio executor). */
export async function falharJob(id: string, motivo: string): Promise<void> {
  await db.generationJob.updateMany({
    where: { id, status: 'RUNNING' },
    data: { status: 'FAILED', finishedAt: new Date(), leaseExpiresAt: null, lastError: motivo.slice(0, 500) },
  })
}

export interface ResultadoRecuperacao {
  reenfileirados: number
  falhados: number
  orfasSemJob: number
}

/**
 * Recuperação — a razão de a fila existir.
 *
 * (a) Job RUNNING com arrendamento vencido = a invocação morreu no meio.
 *     Volta para a fila enquanto houver tentativa; sem tentativa, vira FAILED
 *     junto com a Generation, com o motivo escrito.
 * (b) Generation PROCESSING **sem job nenhum** e velha: são as órfãs
 *     anteriores a esta fila. Não há payload para reexecutar — o honesto é
 *     marcar FAILED com o motivo, para o cliente parar de esperar.
 *
 * ⚠️ A varredura (b) IGNORA Generation ligada a `VideoProcessingJob`: o export
 * de vídeo cria a Generation PROCESSING e a entrega a OUTRA fila, cujo cron
 * processa um job por vez a cada 2 minutos — ficar mais de 10 minutos em
 * PROCESSING ali é normal, e marcá-la FAILED mataria um vídeo saudável. Aquela
 * fila tem a própria recuperação (`failStuckVideoJobs`).
 */
export async function recuperarJobsPerdidos(): Promise<ResultadoRecuperacao> {
  const agora = new Date()
  let reenfileirados = 0
  let falhados = 0

  const vencidos = await db.generationJob.findMany({
    where: { status: 'RUNNING', leaseExpiresAt: { lt: agora } },
    select: { id: true, generationId: true, attempts: true, maxAttempts: true },
    take: 50,
  })

  for (const job of vencidos) {
    if (job.attempts < job.maxAttempts) {
      const r = await db.generationJob.updateMany({
        where: { id: job.id, status: 'RUNNING' },
        data: {
          status: 'PENDING',
          nextAttemptAt: new Date(agora.getTime() + BACKOFF_APOS_MORTE_MS),
          leaseExpiresAt: null,
          lastError: 'a invocação anterior foi interrompida antes de terminar',
        },
      })
      if (r.count > 0) {
        reenfileirados++
        console.warn(
          `[fila-arte] job ${job.id} (tentativa ${job.attempts}/${job.maxAttempts}) voltou à fila — a invocação anterior morreu`,
        )
      }
      continue
    }

    const r = await db.generationJob.updateMany({
      where: { id: job.id, status: 'RUNNING' },
      data: {
        status: 'FAILED',
        finishedAt: agora,
        leaseExpiresAt: null,
        lastError: 'tentativas esgotadas — a execução foi interrompida',
      },
    })
    if (r.count === 0) continue
    falhados++
    await marcarGenerationFalha(
      job.generationId,
      'A geração foi interrompida e as tentativas acabaram. Nada foi cobrado por esta tentativa; peça de novo.',
    )
  }

  // (b) órfãs anteriores à fila
  const orfas = await db.generation.findMany({
    where: {
      status: 'PROCESSING',
      createdAt: { lt: new Date(agora.getTime() - ORFA_SEM_JOB_MS) },
      VideoProcessingJob: { is: null },
    },
    select: { id: true, createdAt: true },
    take: 50,
  })

  let orfasSemJob = 0
  for (const orfa of orfas) {
    const temJob = await db.generationJob.findUnique({
      where: { generationId: orfa.id },
      select: { id: true },
    })
    if (temJob) continue
    const minutos = Math.round((agora.getTime() - orfa.createdAt.getTime()) / 60_000)
    await marcarGenerationFalha(
      orfa.id,
      `A geração ficou ${minutos} minutos sem terminar e a execução dela não existe mais. Peça de novo.`,
    )
    orfasSemJob++
    console.warn(`[fila-arte] Generation órfã ${orfa.id} (${minutos} min em PROCESSING) marcada como falha`)
  }

  return { reenfileirados, falhados, orfasSemJob }
}

/**
 * Marca a Generation como falha PRESERVANDO o fieldValues — ele é o registro
 * atômico da run (prompt, refs, params) e é o que permite entender depois o
 * que aconteceu.
 */
async function marcarGenerationFalha(generationId: string, motivo: string): Promise<void> {
  const gen = await db.generation.findUnique({
    where: { id: generationId },
    select: { fieldValues: true, status: true },
  })
  if (!gen || gen.status !== 'PROCESSING') return
  const anterior =
    gen.fieldValues && typeof gen.fieldValues === 'object' && !Array.isArray(gen.fieldValues)
      ? (gen.fieldValues as Record<string, unknown>)
      : {}
  await db.generation
    .updateMany({
      where: { id: generationId, status: 'PROCESSING' },
      data: {
        status: 'FAILED',
        completedAt: new Date(),
        fieldValues: {
          ...anterior,
          error: motivo,
          failedAt: new Date().toISOString(),
          recuperadaPelaFila: true,
        } as never,
      },
    })
    .catch((erro) => {
      console.error(`[fila-arte] falha ao marcar Generation ${generationId} como FAILED:`, erro)
    })
}
