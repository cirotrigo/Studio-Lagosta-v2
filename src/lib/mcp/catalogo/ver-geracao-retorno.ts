/**
 * O que `ver-geracao` devolve ALÉM do status: a PÁGINA da arte e os avisos do
 * compositor (F0 de "Marca simples, copy melhor", 12/09/2026).
 *
 * Antes, `compor-leva` devolvia só `generationId` e `ver-geracao` não expunha
 * a página — quem seguia a regra da casa ("agende pelo pageId, nunca pelo
 * generationId") tinha de procurar a página na mão. O `editUrl` sai do
 * template ATUAL da página, porque ela muda de pasta ao ser agendada
 * (`moverPaginaParaSemana`) e o template gravado na Generation envelhece.
 *
 * Módulo PURO (sem Prisma): recebe o que o handler leu e devolve o trecho do
 * retorno. É o que deixa o contrato ser testado sem banco.
 */

export interface PaginaDaGeracao {
  id: string
  name: string
  templateId: number
  isTemplate: boolean
}

export interface RetornoDaPagina {
  pageId?: string
  pagina?: string
  editUrl?: string
  /** A página gravada na arte não existe mais (apagada) — só o id fica. */
  paginaApagada?: true
  /** Avisos do compositor (`fieldValues.composicao.avisos`), quando houver. */
  avisosDoCompositor?: string[]
  comoAgendar?: string
}

/** Lê os avisos do compositor sem confiar na forma: só strings não vazias. */
export function avisosDoCompositor(fieldValues: Record<string, unknown> | null | undefined): string[] {
  const composicao = fieldValues?.composicao
  const avisos = composicao && typeof composicao === 'object' && !Array.isArray(composicao) ? (composicao as Record<string, unknown>).avisos : null
  return Array.isArray(avisos) ? avisos.filter((a): a is string => typeof a === 'string' && a.trim().length > 0) : []
}

export function montarRetornoDaPagina(args: {
  fieldValues: Record<string, unknown> | null | undefined
  pagina: PaginaDaGeracao | null
  appUrl: string
  projectId: number
  concluida: boolean
}): RetornoDaPagina {
  const fv = args.fieldValues ?? {}
  const pageId = typeof fv.pageId === 'string' && fv.pageId.trim() ? fv.pageId.trim() : null
  const saida: RetornoDaPagina = {}
  if (pageId) {
    saida.pageId = pageId
    if (args.pagina) {
      saida.pagina = args.pagina.name
      saida.editUrl = `${args.appUrl}/templates/${args.pagina.templateId}/editor?pageId=${encodeURIComponent(args.pagina.id)}`
      if (args.concluida && !args.pagina.isTemplate) {
        saida.comoAgendar = `colocar-na-agenda com projectId ${args.projectId} e pageId "${pageId}" (pela página, nunca pelo generationId — é o que dá o botão Editar Template na agenda).`
      }
    } else {
      saida.paginaApagada = true
    }
  }
  const avisos = avisosDoCompositor(fv)
  if (avisos.length > 0) saida.avisosDoCompositor = avisos
  return saida
}
