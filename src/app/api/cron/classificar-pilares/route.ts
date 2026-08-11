import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { classificarHistorico } from '@/lib/aprendizado/pilares-service'
import {
  LIMITE_POR_PROJETO,
  ORCAMENTO_DA_RODADA_MS,
  filaDeClassificacao,
  percorrerComOrcamento,
} from '@/lib/aprendizado/rodada-de-pilares'

export const runtime = 'nodejs'
/**
 * ⚠️ INLINE, não no `vercel.json`: o glob de lá é `app/api/**` e o projeto é
 * `src/app/**` — nenhuma entrada casa, e a rota rodaria no default da
 * plataforma.
 */
export const maxDuration = 300

interface ResultadoDoProjeto {
  projectId: number
  projeto: string
  classificados: number
  semTexto: number
  naoClassificados: number
  /** Quantos estavam esperando quando a passada começou. */
  pendentes: number
  /** Quantos ficaram para a próxima rodada (teto por projeto ou relógio). */
  restantes: number
  /** Erro que derrubou ESTE projeto — a rodada segue nos outros. */
  falha?: string
  duracaoMs: number
}

/**
 * Classificação diária dos pilares (06:00 UTC = 03:00 BRT).
 *
 * 🔴 O QUE ELE CONSERTA: `classificarHistorico` só rodava quando alguém apertava
 * o botão da aba Marca. Post publicado depois disso ficava **sem pilar para
 * sempre**, e o perfil aprendido (`perfilParaPrompt`, que é o que a geração lê)
 * envelhecia sozinho — justamente na janela de semanas em que o sistema deveria
 * estar acumulando o dado que a próxima fase vai medir.
 *
 * O horário evita companhia: todo cron diário deste projeto está entre 02:00 e
 * 05:00 UTC, e a outra rodada com orçamento de ~4 minutos
 * (`reconciliar-catalogos`) começa às 05:00 e desiste de pegar trabalho novo às
 * 05:04. 06:00 UTC deixa quase uma hora de folga — e o agendamento de cron da
 * plataforma é aproximado, então essa folga é o que impede duas invocações
 * pesadas de dividir o mesmo minuto. Em Brasília são 03:00: o dia dos
 * restaurantes já fechou (inclusive os posts de fim de noite), então a rodada
 * classifica um dia inteiro em vez de metade dele.
 *
 * ORÇAMENTO DE TEMPO: os projetos são processados EM SEQUÊNCIA com um relógio.
 * A rodada para de pegar projeto novo aos `ORCAMENTO_DA_RODADA_MS` e devolve
 * quem ficou de fora; a ordem ROTACIONA por dia, senão o primeiro cliente seria
 * classificado todo dia e o último talvez nunca. Cada projeto ainda tem o seu
 * teto (`LIMITE_POR_PROJETO`), para que um cliente atrasado não coma a rodada.
 *
 * Idempotente: `classificarHistorico` só toca o que ainda não foi classificado
 * nesta versão do classificador, então a rodada de amanhã continua de onde esta
 * parou — sem repetir (nem recobrar) o que já está feito.
 */
export async function GET(req: Request) {
  const inicio = Date.now()
  const prazoEm = inicio + ORCAMENTO_DA_RODADA_MS

  try {
    const authHeader = req.headers.get('authorization')
    const cronSecret = process.env.CRON_SECRET
    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const [projetos, taxonomias] = await Promise.all([
      db.project.findMany({ select: { id: true, name: true }, orderBy: { id: 'asc' } }),
      db.contentPillar.groupBy({
        by: ['projectId'],
        where: { aprovado: true },
        _count: { _all: true },
      }),
    ])

    const aprovadosPorProjeto = new Map(taxonomias.map((t) => [t.projectId, t._count._all]))
    const fila = filaDeClassificacao(
      projetos.map((p) => ({
        id: p.id,
        nome: p.name,
        pilaresAprovados: aprovadosPorProjeto.get(p.id) ?? 0,
      })),
    )

    console.log(
      `[cron:classificar-pilares] ${fila.length} de ${projetos.length} projeto(s) com taxonomia aprovada`,
    )

    const { feitos, adiados } = await percorrerComOrcamento(
      fila,
      async (projeto): Promise<ResultadoDoProjeto> => {
        const t0 = Date.now()
        const base = { projectId: projeto.id, projeto: projeto.nome }
        try {
          const r = await classificarHistorico(projeto.id, {
            limite: LIMITE_POR_PROJETO,
            prazoEm,
          })
          const resultado: ResultadoDoProjeto = {
            ...base,
            classificados: r.classificados,
            semTexto: r.semTexto,
            naoClassificados: r.naoClassificados,
            pendentes: r.pendentes,
            restantes: r.restantes,
            duracaoMs: Date.now() - t0,
          }
          if (r.classificados > 0 || r.restantes > 0) {
            console.log(
              `[cron:classificar-pilares] ${projeto.id} ${projeto.nome}: ${r.classificados} classificada(s) de ${r.pendentes} pendente(s), ${r.restantes} restante(s) em ${resultado.duracaoMs}ms`,
            )
          }
          return resultado
        } catch (error) {
          // Falha num projeto NUNCA vira catástrofe: loga e vai para o próximo.
          const motivo = error instanceof Error ? error.message : 'Erro desconhecido'
          console.error(`[cron:classificar-pilares] ${projeto.id} ${projeto.nome} falhou:`, error)
          return {
            ...base,
            classificados: 0,
            semTexto: 0,
            naoClassificados: 0,
            pendentes: 0,
            restantes: 0,
            falha: motivo,
            duracaoMs: Date.now() - t0,
          }
        }
      },
      { prazoEm },
    )

    const totais = feitos.reduce(
      (acc, r) => ({
        classificados: acc.classificados + r.classificados,
        semTexto: acc.semTexto + r.semTexto,
        naoClassificados: acc.naoClassificados + r.naoClassificados,
        // O que ficou pendente inclui o que a rodada nem chegou a olhar: teto
        // de cobertura que não aparece no relato é teto que mente.
        restantes: acc.restantes + r.restantes,
      }),
      { classificados: 0, semTexto: 0, naoClassificados: 0, restantes: 0 },
    )

    const naoProcessados = adiados.map((p) => ({ projectId: p.id, projeto: p.nome }))
    const duracaoMs = Date.now() - inicio
    console.log(
      `[cron:classificar-pilares] fim em ${duracaoMs}ms — ${totais.classificados} classificada(s), ${totais.restantes} restante(s), ${naoProcessados.length} projeto(s) para amanhã`,
    )

    return NextResponse.json({
      success: true,
      totais,
      projetos: feitos,
      naoProcessados,
      duracaoMs,
    })
  } catch (error) {
    console.error('[cron:classificar-pilares] Fatal error:', error)
    return NextResponse.json(
      {
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 },
    )
  }
}
