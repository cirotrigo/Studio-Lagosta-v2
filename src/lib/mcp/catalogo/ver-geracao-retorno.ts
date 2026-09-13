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

/**
 * A mensagem do ramo FALHOU e os detalhes que a sustentam. A promessa de
 * orçamento só é feita quando o orçamento VEIO (`errorDetails.orcamento`, que
 * a fila preserva de `TEXTO_NAO_CABE_NA_COLUNA`) — prometer o que a resposta
 * não entrega deixava o chamador adivinhando quanto cortar (revisão do Codex,
 * 12/09/2026).
 */
export function falhaDaGeracao(args: {
  fieldValues: Record<string, unknown> | null | undefined
  doCompositor: boolean
  ehMelhoria: boolean
}): { mensagem: string; detalhes?: Record<string, unknown> } {
  const fv = args.fieldValues ?? {}
  const detalhes = fv.errorDetails && typeof fv.errorDetails === 'object' && !Array.isArray(fv.errorDetails) ? (fv.errorDetails as Record<string, unknown>) : undefined
  if (args.doCompositor) {
    const temOrcamento = !!detalhes && 'orcamento' in detalhes
    return {
      mensagem: temOrcamento
        ? 'A composição falhou e nada foi gravado na galeria — o texto não coube na coluna; use o orçamento em `detalhes.orcamento` (caracteres que cabem) para reescrever e compor de novo.'
        : 'A composição falhou e nada foi gravado na galeria — o motivo está acima. Reveja a copy ou a variante e componha de novo.',
      ...(detalhes ? { detalhes } : {}),
    }
  }
  return {
    mensagem: args.ehMelhoria
      ? 'A melhoria foi descartada e a arte original continua valendo — nada mudou no post nem na galeria. Dá para tentar de novo com um pedido mais específico.'
      : 'A geração falhou e nada foi gravado na galeria. Dá para tentar de novo com um pedido mais específico.',
    ...(detalhes ? { detalhes } : {}),
  }
}
