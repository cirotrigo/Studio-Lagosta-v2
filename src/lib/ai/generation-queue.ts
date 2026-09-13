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

/**
 * RECOMPOSIÇÃO de uma peça cuja página foi editada — mesma fila (`COMPOR`),
 * trabalho diferente: refazer a arte da PÁGINA QUE JÁ EXISTE e trocar a
 * posição dela nos posts que a invalidação não alcança (o slide de carrossel).
 * Ver `src/lib/compositor/recompor.ts`.
 *
 * Duas diferenças de contrato em relação a `enfileirarComposicao`, e as duas
 * importam:
 *
 * 1. **O job VOLTA à fila quando já terminou.** A composição é pedida uma vez
 *    por peça, então `update: {}` basta lá; a recomposição é pedida a cada
 *    edição, e um job DONE de uma edição anterior engoliria a seguinte em
 *    silêncio — que é exatamente o defeito que isto veio consertar.
 * 2. **Não carrega spec.** Ela é lida da própria arte no momento de executar,
 *    junto com as camadas da página — é o que faz o job trabalhar sempre
 *    sobre a versão mais nova, mesmo tendo sido enfileirado três edições
 *    atrás.
 *
 * `generationId` é o da ARTE que já existe (COMPLETED), não uma linha nova:
 * uma peça tem uma arte, e a fila tem um job por arte. Job RUNNING não é
 * mexido — quem está trabalhando lê a página no fim e, se ela mudou de novo,
 * pede outra tentativa.
 */
export async function enfileirarRecomposicao(args: RecomposicaoJobArgs): Promise<string> {
  /**
   * Toda recuperação FORÇADA carrega um carimbo próprio (`forcaPedidaEm`): é
   * por ele que o executor diz "esta força eu atendi" (`marcarForcaAtendida`)
   * e que `fecharJob` distingue força atendida de força que chegou no meio
   * (REV-06 da revisão do Codex, 12/09/2026).
   */
  const pedido: RecomposicaoJobArgs =
    args.recompor.forcar === true
      ? { ...args, recompor: { ...args.recompor, forcaPedidaEm: args.recompor.forcaPedidaEm ?? new Date().toISOString() } }
      : args
  const limpo = JSON.parse(JSON.stringify(pedido)) as Record<string, unknown>
  const job = await db.generationJob.upsert({
    where: { generationId: args.generationId },
    create: { generationId: args.generationId, kind: 'COMPOR', projectId: args.projectId, payload: limpo as never, maxAttempts: 3 },
    update: {},
    select: { id: true },
  })
  if (pedido.recompor.forcar !== true) {
    await reabrirRecomposicaoTerminada(job.id, limpo)
    return job.id
  }
  /**
   * A recuperação FORÇADA não pode ser descartada por um pedido que já estava
   * na fila (REV-03): o `update: {}` acima preserva o payload de um job
   * PENDING/RUNNING, e o executor receberia o pedido antigo sem `forcar` —
   * recomporia pela spec e apagaria o ajuste. Job PENDING/RUNNING é PROMOVIDO
   * ao payload forçado numa escrita só; o RUNNING ganha também orçamento
   * próprio (`maxAttempts` ≥ attempts + 1) para a re-execução que `fecharJob`
   * vai pedir caber mesmo quando a força chega na última tentativa (REV-07).
   * Se o job terminou entre uma escrita e outra, reabre; o laço converge em
   * poucas voltas porque cada volta cobre um estado.
   */
  for (let volta = 0; volta < 4; volta++) {
    const atual = await db.generationJob.findUnique({ where: { id: job.id }, select: { status: true, attempts: true, maxAttempts: true, payload: true } })
    if (!atual) break
    if (atual.status === 'PENDING' || atual.status === 'RUNNING') {
      // Compare-and-set no payload LIDO: quem perder a corrida relê e tenta de novo.
      const r = await db.generationJob.updateMany({
        where: { id: job.id, status: atual.status, payload: { equals: atual.payload as never } },
        data: { payload: limpo as never, ...(atual.status === 'RUNNING' ? { maxAttempts: Math.max(atual.maxAttempts, atual.attempts + 1) } : {}) },
      })
      if (r.count > 0) return job.id
      continue
    }
    if (await reabrirRecomposicaoTerminada(job.id, limpo)) return job.id
  }
  return job.id
}

/** Job DONE/FAILED volta a PENDING com o pedido novo (a edição seguinte reabre o job do zero). */
async function reabrirRecomposicaoTerminada(id: string, payload: Record<string, unknown>): Promise<boolean> {
  const r = await db.generationJob.updateMany({
    where: { id, status: { in: ['DONE', 'FAILED'] } },
    data: {
      kind: 'COMPOR',
      status: 'PENDING',
      payload: payload as never,
      attempts: 0,
      maxAttempts: 3,
      nextAttemptAt: new Date(),
      leaseExpiresAt: null,
      startedAt: null,
      finishedAt: null,
      lastError: null,
    },
  })
  return r.count > 0
}

/**
 * O executor HONROU a recuperação forçada com que partiu (`pedidaEm`): grava
 * `forcaAtendida` no payload — por compare-and-set: se uma força MAIS NOVA
 * chegou durante a execução, o carimbo não casa, nada é marcado, e
 * `fecharJob` devolve o job à fila em vez de DONE.
 */
export async function marcarForcaAtendida(queueJobId: string | null | undefined, pedidaEm: string | null | undefined): Promise<boolean> {
  if (!queueJobId) return false
  const atual = await db.generationJob.findUnique({ where: { id: queueJobId }, select: { status: true, payload: true } })
  if (!atual || atual.status !== 'RUNNING') return false
  const recompor = recomporDoPayload(atual.payload)
  if ((recompor.forcaPedidaEm ?? '') !== (pedidaEm ?? '')) return false
  const novo = { ...(atual.payload as Record<string, unknown>), recompor: { ...recompor, forcaAtendida: pedidaEm ?? '' } }
  const r = await db.generationJob.updateMany({
    where: { id: queueJobId, status: 'RUNNING', payload: { equals: atual.payload as never } },
    data: { payload: novo as never },
  })
  return r.count > 0
}

type RecomporNoPayload = { forcar?: boolean; forcaPedidaEm?: string; forcaTentada?: string; forcaAtendida?: string; renderizarComoEsta?: boolean; [k: string]: unknown }
function recomporDoPayload(payload: unknown): RecomporNoPayload {
  const r = payload && typeof payload === 'object' ? (payload as { recompor?: unknown }).recompor : null
  return r && typeof r === 'object' ? (r as RecomporNoPayload) : {}
}
/** Há recuperação forçada pedida que o executor ainda não atendeu? */
function forcaPendente(payload: unknown): boolean {
  const r = recomporDoPayload(payload)
  return (r.forcaPedidaEm ?? '') !== (r.forcaAtendida ?? '')
}
/**
 * Há força NOVA — pedida DEPOIS de a execução em curso começar? É a única que
 * justifica devolver à fila um job cuja execução FALHOU: a força que a própria
 * execução tentava atender e não conseguiu não é "pendente", é falha
 * (REV-09 da revisão do Codex, 12/09/2026 — sem isso a forçada que falhava na
 * última tentativa voltava PENDING sem orçamento, inalcançável para sempre).
 */
function forcaNovaDesdeOInicio(payload: unknown): boolean {
  const r = recomporDoPayload(payload)
  const pedida = r.forcaPedidaEm ?? ''
  return pedida !== (r.forcaAtendida ?? '') && pedida !== (r.forcaTentada ?? '')
}

/**
 * Liga (ou desliga) no payload do job RUNNING o marcador de que a PRÓXIMA
 * execução deve re-renderizar a página COMO ESTÁ, mesmo que a defasagem por
 * conteúdo diga "em dia" (REV-FINAL-01 da revisão FINAL do Codex,
 * 12/09/2026): a divergência de versão detectada depois da recomposição pode
 * ser só de gradiente (paradas, força), que o diff geométrico não enxerga — e
 * o retry com o payload normal saía sem renderizar, DONE com o slide velho.
 * Compare-and-set no payload lido; a força pedida (`forcar`) não é tocada.
 */
export async function marcarRenderComoEsta(queueJobId: string | null | undefined, ligar: boolean): Promise<boolean> {
  if (!queueJobId) return false
  for (let volta = 0; volta < 3; volta++) {
    const atual = await db.generationJob.findUnique({ where: { id: queueJobId }, select: { status: true, payload: true } })
    if (!atual || atual.status !== 'RUNNING') return false
    const recompor = recomporDoPayload(atual.payload)
    if (!!recompor.renderizarComoEsta === ligar) return true
    const { renderizarComoEsta: _r, ...resto } = recompor
    const novo = { ...(atual.payload as Record<string, unknown>), recompor: ligar ? { ...recompor, renderizarComoEsta: true } : resto }
    const r = await db.generationJob.updateMany({ where: { id: queueJobId, status: 'RUNNING', payload: { equals: atual.payload as never } }, data: { payload: novo as never } })
    if (r.count > 0) return true
  }
  return false
}

/**
 * O executor COMEÇOU a atender a força `pedidaEm`: grava `forcaTentada` por
 * compare-and-set. Se essa execução falhar, `falharJob` sabe que não é força
 * nova e fecha FAILED (terminal, reabrível pela próxima edição).
 */
export async function marcarForcaEmExecucao(queueJobId: string | null | undefined, pedidaEm: string | null | undefined): Promise<boolean> {
  if (!queueJobId) return false
  const atual = await db.generationJob.findUnique({ where: { id: queueJobId }, select: { status: true, payload: true } })
  if (!atual || atual.status !== 'RUNNING') return false
  const recompor = recomporDoPayload(atual.payload)
  if ((recompor.forcaPedidaEm ?? '') !== (pedidaEm ?? '')) return false
  const novo = { ...(atual.payload as Record<string, unknown>), recompor: { ...recompor, forcaTentada: pedidaEm ?? '' } }
  const r = await db.generationJob.updateMany({ where: { id: queueJobId, status: 'RUNNING', payload: { equals: atual.payload as never } }, data: { payload: novo as never } })
  return r.count > 0
}

/** O payload de um job COMPOR — o que `processarComposicaoEmBackground` recebe. */
export interface ComposicaoJobArgs {
  generationId: string
  projectId: number
  /**
   * A spec validada (`src/lib/compositor/spec.ts`). Obrigatória na composição;
   * ausente na RECOMPOSIÇÃO, que a lê da própria arte ao executar.
   */
  spec?: unknown
  decididoPor?: string | null
  /** Quem assina a arte (User.id interno); sem isso, o dono do projeto. */
  autor?: string | null
  /**
   * Presente = este job REFAZ a arte de uma página editada, em vez de compor
   * uma peça nova. Ver `enfileirarRecomposicao`.
   */
  recompor?: { pageId: string; origem: OrigemDaRecomposicao } | null
}

/** De onde veio o pedido: o autosave do editor, ou a varredura por conteúdo. */
export type OrigemDaRecomposicao = 'editor' | 'varredura'

export interface RecomposicaoJobArgs {
  /** A Generation da arte que já existe — a mesma linha é atualizada. */
  generationId: string
  projectId: number
  recompor: {
    pageId: string
    origem: 'editor' | 'varredura'
    forcar?: boolean
    /** Posto pelo executor ao devolver o job à fila por divergência de versão: a próxima execução re-renderiza a página como está (REV-FINAL-01). */
    renderizarComoEsta?: boolean
    /** Carimbo (ISO) da força pedida — posto por `enfileirarRecomposicao`; `forcaAtendida` recebe o mesmo valor quando o executor a honra. */
    forcaPedidaEm?: string
    /** O carimbo da força que a execução em curso está TENTANDO atender (posto ao começar) — a que falhar não volta à fila como se fosse nova. */
    forcaTentada?: string
    forcaAtendida?: string
  }
  decididoPor?: string | null
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
export async function reservarJob(id: string): Promise<JobParaExecutar | null> {
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
  if (r.count === 0) return null
  /**
   * O job FRESCO, não o que a varredura capturou: entre a varredura e a
   * reserva o payload pode ter sido promovido a uma recuperação forçada, e
   * executar o payload antigo gastaria a tentativa sem atender à força — na
   * última tentativa deixava o job PENDING sem orçamento (REV-07, segunda
   * rodada). Quem executa roda o que está no banco AGORA.
   */
  return buscarJob(id)
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
  const gen = await db.generation.findUnique({
    where: { id: generationId },
    select: { status: true, fieldValues: true },
  })
  const ok = gen?.status === 'COMPLETED'
  const registrado =
    !ok && gen?.fieldValues && typeof gen.fieldValues === 'object'
      ? String((gen.fieldValues as Record<string, unknown>).error ?? '').slice(0, 500)
      : ''
  // Generation que o runner NÃO fechou (ainda PROCESSING, ou sumiu) é defeito
  // do runner, não da arte — e precisa ficar escrito. Em 04/09/2026 vinte jobs
  // COMPOR do Espeto Gaúcho viraram FAILED sem `lastError` nenhum porque o
  // compositor gravava a peça numa Generation NOVA e deixava a da fila em
  // PROCESSING; sem o motivo, o sintoma parecia falha de render.
  const erro = ok
    ? null
    : registrado ||
      (!gen
        ? 'a Generation deste job não existe mais'
        : `o runner terminou sem fechar a Generation (ficou ${gen.status}) — defeito do runner, não da arte`)

  /**
   * O fechamento é compare-and-set sobre o PAYLOAD lido: só fecha se ninguém
   * o mudou entre a leitura e a escrita — e só fecha DONE/FAILED se não há
   * recuperação forçada pedida sem atender (`forcaPedidaEm` ≠ `forcaAtendida`).
   * Força que chegou durante a execução (promovida em `enfileirarRecomposicao`,
   * inclusive na janela entre o fim do runner e este fechamento) não pode
   * morrer num job DONE com o pedido no payload (REV-06); o job volta à fila,
   * com o orçamento que a promoção já garantiu (REV-07). Duas escritas na
   * mesma linha se serializam no Postgres: a segunda sempre enxerga a primeira.
   */
  for (let volta = 0; volta < 4; volta++) {
    const job = await db.generationJob.findUnique({ where: { id }, select: { status: true, payload: true } })
    if (!job) return ok ? 'DONE' : 'FAILED'
    // O runner pediu outra tentativa: o job já voltou para PENDING e não é
    // nosso para fechar.
    if (job.status === 'PENDING') return 'REENFILEIRADO'
    if (job.status !== 'RUNNING') return ok ? 'DONE' : 'FAILED'
    if (forcaPendente(job.payload)) {
      const orcamento = await db.generationJob.findUnique({ where: { id }, select: { attempts: true, maxAttempts: true } })
      const devolvido = await db.generationJob.updateMany({
        where: { id, status: 'RUNNING', payload: { equals: job.payload as never } },
        data: {
          status: 'PENDING',
          nextAttemptAt: new Date(),
          leaseExpiresAt: null,
          // Nunca PENDING sem orçamento (REV-09).
          ...(orcamento ? { maxAttempts: Math.max(orcamento.maxAttempts, orcamento.attempts + 1) } : {}),
          lastError: 'recuperação forçada chegou durante a execução',
        },
      })
      if (devolvido.count > 0) {
        console.log(`[fila-arte] job ${id} devolvido à fila: recuperação forçada chegou durante a execução`)
        return 'REENFILEIRADO'
      }
      continue
    }
    const fechado = await db.generationJob.updateMany({
      where: { id, status: 'RUNNING', payload: { equals: job.payload as never } },
      data: {
        status: ok ? 'DONE' : 'FAILED',
        finishedAt: new Date(),
        leaseExpiresAt: null,
        ...(erro ? { lastError: erro } : {}),
      },
    })
    if (fechado.count > 0) return ok ? 'DONE' : 'FAILED'
  }
  return 'REENFILEIRADO'
}

/** Marca o job como falho sem consultar a Generation (erro do próprio executor). */
export async function falharJob(id: string, motivo: string): Promise<'FAILED' | 'REENFILEIRADO'> {
  /**
   * O fechamento por ERRO tem a mesma regra do fechamento normal: força
   * pedida e não atendida devolve o job à fila (com o orçamento que a promoção
   * garantiu) em vez de matá-lo FAILED com o pedido no payload (REV-06,
   * segunda rodada da revisão do Codex). O motivo da falha fica registrado nos
   * dois casos.
   */
  for (let volta = 0; volta < 4; volta++) {
    const job = await db.generationJob.findUnique({ where: { id }, select: { status: true, payload: true, attempts: true, maxAttempts: true } })
    if (!job || job.status !== 'RUNNING') return job?.status === 'PENDING' ? 'REENFILEIRADO' : 'FAILED'
    // Só força NOVA (chegada depois de esta execução começar) reabre; a força
    // que esta execução tentava atender e falhou é falha terminal — a próxima
    // edição reabre o job do zero (REV-09).
    const nova = forcaNovaDesdeOInicio(job.payload)
    const r = await db.generationJob.updateMany({
      where: { id, status: 'RUNNING', payload: { equals: job.payload as never } },
      data: nova
        ? {
            status: 'PENDING',
            nextAttemptAt: new Date(),
            leaseExpiresAt: null,
            // Nunca PENDING sem orçamento: a re-execução precisa caber.
            maxAttempts: Math.max(job.maxAttempts, job.attempts + 1),
            lastError: `${motivo.slice(0, 400)} — recuperação forçada nova pendente: volta à fila`,
          }
        : { status: 'FAILED', finishedAt: new Date(), leaseExpiresAt: null, lastError: motivo.slice(0, 500) },
    })
    if (r.count > 0) return nova ? 'REENFILEIRADO' : 'FAILED'
  }
  return 'FAILED'
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
export async function recuperarJobsPerdidos(
  opcoes: {
    /** Só para a prova de integração: restringe a varredura a estes jobs e abre a costura entre a leitura e a decisão. */
    apenas?: string[]
    seams?: { depoisDeLerOsVencidos?: () => Promise<void> }
  } = {},
): Promise<ResultadoRecuperacao> {
  const agora = new Date()
  let reenfileirados = 0
  let falhados = 0

  const vencidos = await db.generationJob.findMany({
    where: { status: 'RUNNING', leaseExpiresAt: { lt: agora }, ...(opcoes.apenas ? { id: { in: opcoes.apenas } } : {}) },
    select: { id: true, generationId: true, attempts: true, maxAttempts: true, payload: true },
    take: 50,
  })
  if (opcoes.seams?.depoisDeLerOsVencidos) await opcoes.seams.depoisDeLerOsVencidos()

  /**
   * 🔴 A decisão (devolver à fila × FAILED terminal) é tomada sobre o que foi
   * LIDO, e a escrita é compare-and-set sobre exatamente isso — tentativas,
   * orçamento e payload. Entre a leitura e a escrita um ajuste cujo render
   * falhou pode PROMOVER o job (força nova no payload e `maxAttempts`
   * ampliado, `enfileirarRecomposicao`): com o filtro só por id e status, a
   * recuperação gravava FAILED por cima da força aceita, com orçamento
   * disponível, e o carrossel ficava com a arte anterior (REV-127-01 da
   * revisão FINAL do Codex, 12/09/2026). Perdeu a corrida → relê e decide de
   * novo sobre o estado atual.
   */
  for (const lido of vencidos) {
    let job = lido
    for (let volta = 0; volta < 4; volta++) {
      const cas = { id: job.id, status: 'RUNNING' as const, attempts: job.attempts, maxAttempts: job.maxAttempts, payload: { equals: job.payload as never } }
      if (job.attempts < job.maxAttempts) {
        const r = await db.generationJob.updateMany({
          where: cas,
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
          break
        }
      } else {
        const r = await db.generationJob.updateMany({
          where: cas,
          data: {
            status: 'FAILED',
            finishedAt: agora,
            leaseExpiresAt: null,
            lastError: 'tentativas esgotadas — a execução foi interrompida',
          },
        })
        if (r.count > 0) {
          falhados++
          await marcarGenerationFalha(
            job.generationId,
            'A geração foi interrompida e as tentativas acabaram. Nada foi cobrado por esta tentativa; peça de novo.',
          )
          break
        }
      }
      // Perdeu a corrida: alguém mexeu no job entre a leitura e a escrita. Relê.
      const atual = await db.generationJob.findUnique({
        where: { id: job.id },
        select: { id: true, generationId: true, attempts: true, maxAttempts: true, payload: true, status: true, leaseExpiresAt: true },
      })
      if (!atual || atual.status !== 'RUNNING' || !atual.leaseExpiresAt || atual.leaseExpiresAt >= agora) break
      job = atual
    }
  }

  // (b) órfãs anteriores à fila — SÓ na varredura global: com `apenas` (a
  // prova), esta etapa alcançaria Generations de outros projetos e as marcaria
  // FAILED fora do que a prova criou (REV-4B-01 da revisão do Codex, 12/09/2026).
  if (opcoes.apenas) return { reenfileirados, falhados, orfasSemJob: 0 }
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
