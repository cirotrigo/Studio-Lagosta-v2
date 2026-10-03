/**
 * A cobrança do job de vídeo sai UMA vez, por construção: a marca
 * `creditsDeducted` é gravada DENTRO da transação do débito
 * (`deductCreditsForFeature({ noMesmoCommit })`), condicionada a ela ainda
 * estar falsa e ao arrendamento ser o desta execução. Se a marca já estava
 * gravada (uma tentativa anterior cobrou e caiu depois do commit) ou o job
 * mudou de dono, o gancho lança e o débito é desfeito junto.
 *
 * Sem Prisma: o tipo do cliente é o mínimo que o gancho usa, para o teste
 * rodar com banco falso.
 */
export class CobrancaRecusada extends Error {
  constructor() {
    super('A cobrança deste vídeo já foi feita, ou o job mudou de dono.')
    this.name = 'CobrancaRecusada'
  }
}

interface ClienteDoJob {
  videoProcessingJob: {
    updateMany(args: {
      where: { id: string; status: 'PROCESSING'; startedAt: Date; creditsDeducted: false }
      data: { creditsDeducted: true }
    }): Promise<{ count: number }>
  }
}

/** O débito pode ter acontecido (erro depois do commit) e a marca relida não confirmou: o job fica para a recuperação. */
export class CobrancaIncerta extends Error {
  constructor(readonly causa: unknown) {
    super(
      `Não deu para confirmar a cobrança deste vídeo (${causa instanceof Error ? causa.message : String(causa)}) — ele volta para a fila.`,
    )
    this.name = 'CobrancaIncerta'
  }
}

/**
 * Cobra o vídeo uma vez e diz o que aconteceu, mesmo quando a chamada lança.
 *
 * Erro do débito é AMBÍGUO: a conexão pode cair depois do commit, com o
 * cliente cobrado e a resposta perdida. Só a marca `creditsDeducted` relida
 * decide — ela nasce no MESMO commit do débito. Marca gravada (e o job ainda
 * desta execução) → cobrado; job de outra execução → arrendamento perdido;
 * marca ausente, ou a releitura falhou → `CobrancaIncerta`, e o job fica
 * PROCESSING para a recuperação: um commit ainda em voo apareceria depois, e a
 * repetição não cobra de novo (o gancho recusa a marca já gravada). Só o erro
 * `definitivo` (o débito não aconteceu, como saldo insuficiente) sobe como está
 * e falha o job.
 */
export async function cobrarUmaVez(p: {
  cobrar: () => Promise<unknown>
  reler: () => Promise<{ status: string; startedAt: Date | null; creditsDeducted: boolean } | null>
  startedAt: Date
  definitivo: (erro: unknown) => boolean
}): Promise<'cobrado' | 'arrendamento-perdido'> {
  try {
    await p.cobrar()
    return 'cobrado'
  } catch (erro) {
    if (p.definitivo(erro)) throw erro
    let atual: Awaited<ReturnType<typeof p.reler>>
    try {
      atual = await p.reler()
    } catch {
      throw new CobrancaIncerta(erro)
    }
    if (!atual || atual.status !== 'PROCESSING' || atual.startedAt?.getTime() !== p.startedAt.getTime()) {
      return 'arrendamento-perdido'
    }
    if (atual.creditsDeducted) return 'cobrado'
    throw new CobrancaIncerta(erro)
  }
}

export function marcarCobrancaNoMesmoCommit(jobId: string, startedAt: Date) {
  return async (tx: unknown) => {
    const r = await (tx as ClienteDoJob).videoProcessingJob.updateMany({
      where: { id: jobId, status: 'PROCESSING', startedAt, creditsDeducted: false },
      data: { creditsDeducted: true },
    })
    if (r.count !== 1) throw new CobrancaRecusada()
  }
}
