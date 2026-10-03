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

export function marcarCobrancaNoMesmoCommit(jobId: string, startedAt: Date) {
  return async (tx: unknown) => {
    const r = await (tx as ClienteDoJob).videoProcessingJob.updateMany({
      where: { id: jobId, status: 'PROCESSING', startedAt, creditsDeducted: false },
      data: { creditsDeducted: true },
    })
    if (r.count !== 1) throw new CobrancaRecusada()
  }
}
