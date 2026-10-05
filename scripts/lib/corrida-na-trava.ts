/**
 * Uma corrida REAL na trava consultiva de uma chave (R12-09), com a barreira dada pelo BANCO — o molde do passo
 * 6v de `validar-migracao-da-voz.ts`, usado pelo passo 21 da prova do PR 12. Sem Prisma: quem chama passa a
 * fábrica do cliente (a prova passa a URL que `destino-da-prova.ts` validou — R12-10).
 *
 * O "dono" segura `pg_advisory_xact_lock(hashtext(chave))` como a primeira execução a seguraria; a chamada REAL
 * começa; o vigia pergunta ao Postgres (`pg_blocking_pids`) se ela está BLOQUEADA pelo dono; só então o dono cria
 * o que a primeira execução criaria e commita.
 *
 * - R12-10: a criação só é AUTORIZADA com o bloqueio confirmado. Sem ele a corrida FALHA (`BloqueioNaoObservado`)
 *   e o dono desiste com rollback — a prova não "prova" exclusão que não observou, e a conexão auxiliar não
 *   escreve nada.
 * - R12-11: toda espera termina também quando o lado que sinalizaria falha. A transação do dono que termina (ou
 *   rejeita) antes de sinalizar a trava faz a corrida REJEITAR em vez de esperar para sempre; no encerramento o
 *   dono é sempre liberado (desistindo, se nada autorizou a criação), a chamada real é aguardada — ela termina
 *   quando a trava é solta — e os dois clientes são desconectados. É o que deixa o cleanup da prova alcançável.
 */

type Consulta = <T = unknown>(partes: TemplateStringsArray, ...valores: unknown[]) => Promise<T>

export interface TransacaoDeCorrida {
  $queryRaw: Consulta
}

export interface ClienteDeCorrida {
  $transaction<R>(fn: (tx: TransacaoDeCorrida) => Promise<R>, opcoes: { timeout: number; maxWait: number }): Promise<R>
  $queryRaw: Consulta
  $disconnect(): Promise<void>
}

/** O que o cliente entrega ao callback da transação — o `Prisma.TransactionClient`, no cliente de verdade. */
type TransacaoDe<CL extends ClienteDeCorrida> = Parameters<Parameters<CL['$transaction']>[0]>[0]

export class BloqueioNaoObservado extends Error {}
class DonoDesistiu extends Error {}

export async function corridaNaTrava<CL extends ClienteDeCorrida, T, C, V = null>(args: {
  chave: string
  /** Chamada duas vezes: o dono e o vigia. Na prova, com a URL que `destino-da-prova.ts` validou (R12-10). */
  criarCliente: () => CL
  /** A chamada REAL, que deve esperar a trava do dono. */
  segunda: () => Promise<T>
  /** O que a primeira execução criaria — só roda com o bloqueio confirmado. */
  criarComoDono: (tx: TransacaoDe<CL>) => Promise<C>
  /** Lido pelo vigia DURANTE o bloqueio (a conexão da prova pode ser a que a transação bloqueada segura). */
  duranteOBloqueio?: (vigia: CL) => Promise<V>
  tentativas?: number
  intervaloMs?: number
}): Promise<{ bloqueou: true; criado: C; lidoNoBloqueio: V | null; valor: T | null; erro: unknown }> {
  const { chave, segunda, criarComoDono, duranteOBloqueio } = args
  const tentativas = args.tentativas ?? 320
  const intervaloMs = args.intervaloMs ?? 25
  const dono = args.criarCliente()
  const vigia = args.criarCliente()

  let decidir!: (criar: boolean) => void
  const decisao = new Promise<boolean>((r) => { decidir = r })
  let avisarTravado!: () => void
  let falharTravado!: (erro: unknown) => void
  const travado = new Promise<void>((resolve, reject) => {
    avisarTravado = resolve
    falharTravado = reject
  })
  let pidDoDono = 0
  let criado: C | undefined
  const primeira = dono.$transaction(async (tx) => {
    const [linha] = await tx.$queryRaw<Array<{ pid: number }>>`SELECT pg_backend_pid()::int AS pid FROM pg_advisory_xact_lock(hashtext(${chave}))`
    pidDoDono = linha.pid
    avisarTravado()
    if (!(await decisao)) throw new DonoDesistiu('a primeira execução desistiu sem criar (rollback)')
    criado = await criarComoDono(tx as TransacaoDe<CL>)
  }, { timeout: 60_000, maxWait: 60_000 })
  // A barreira termina também quando a transação do dono termina sem ter sinalizado a trava (R12-11).
  primeira.then(() => falharTravado(new Error(`a transação da primeira execução terminou sem sinalizar a trava (chave ${chave})`)), falharTravado)

  let resultado: Promise<{ valor: T | null; erro: unknown }> | null = null
  try {
    await travado
    resultado = segunda().then((valor) => ({ valor, erro: null as unknown }), (erro: unknown) => ({ valor: null, erro }))
    let bloqueou = false
    for (let i = 0; i < tentativas && !bloqueou; i++) {
      const [{ n }] = await vigia.$queryRaw<Array<{ n: number }>>`SELECT count(*)::int AS n FROM pg_stat_activity a WHERE a.wait_event_type = 'Lock' AND ${pidDoDono} = ANY(pg_blocking_pids(a.pid))`
      bloqueou = Number(n) > 0
      if (!bloqueou) await new Promise((r) => setTimeout(r, intervaloMs))
    }
    if (!bloqueou) {
      throw new BloqueioNaoObservado(`o banco não confirmou que a chamada real ficou bloqueada pela primeira execução (chave ${chave}) — a exclusão não foi observada, e a conexão auxiliar não criou nada`)
    }
    const lidoNoBloqueio = duranteOBloqueio ? await duranteOBloqueio(vigia) : null
    decidir(true)
    await primeira
    const { valor, erro } = await resultado
    return { bloqueou: true, criado: criado as C, lidoNoBloqueio, valor, erro }
  } finally {
    // Sem autorização, o dono desiste: rollback, a trava é solta e a chamada real termina antes de desconectar.
    decidir(false)
    await primeira.catch(() => undefined)
    if (resultado) await resultado
    await Promise.allSettled([dono.$disconnect(), vigia.$disconnect()])
  }
}
