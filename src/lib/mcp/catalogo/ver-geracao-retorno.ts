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

import { diferencasDeBlocos, lerCopyAutoral, type ConferenciaDaCopy, type CopyAutoral } from '../../copy-autoral'
import { VERSAO_DAS_REGRAS } from '../../creatives/revisao/contrato'
import { POLITICA_DO_ASSUNTO_RECOMENDADA, VERSAO_DO_GATE, type GateDaArte, type PoliticaDoAssunto } from '../../creatives/revisao/gate'
import { lerGateDaArte, validadeDoGate, type DivergenciaDoGate, type OrigemDoGate } from '../../creatives/revisao/gate-registro'
import { identidadeDaPagina } from '../../creatives/revisao/versao'

/** A copy da arte, comparável INTEIRA com o que o autor escreveu (F1). */
export interface CopyDaArte {
  /** Só é comparável quando a autoria do original é conhecida (legado adaptado não conta como fidelidade comprovada). */
  comparavel: boolean
  /** Por onde a comparação é possível: `camadas` (a efetiva lida da página) ou `visao` (a transcrição da arte de IA). */
  comparadoPor?: 'camadas' | 'visao'
  original: Array<{ id: string; funcao: string; linhas: string[] }>
  /** Via de IA/melhoria: o texto como FOI ao modelo de imagem, lido do prompt que saiu; ausente quando o prompt não deixa dizer (a lacuna explica). */
  enviada?: string[]
  desenhada: Array<{ id: string; funcao: string; linhas: string[] }>
  /** Via de IA/melhoria: o que a visão leu, o que faltou, se passou. */
  conferencia?: ConferenciaDaCopy
  /** Os blocos cujo texto exato (caixa, acento, quebra, colchetes) difere entre o escrito e o desenhado. */
  blocosDiferentes: string[]
  /** O que o contrato NÃO conseguiu conferir (bloco não desenhado, texto a mais na arte…). */
  lacunas: string[]
}

function resumoDosBlocos(copy: CopyAutoral) {
  return [...copy.blocos].sort((a, b) => a.ordem - b.ordem).map((b) => ({ id: b.id, funcao: b.funcao, linhas: b.linhas }))
}

/** Lê `fieldValues.copyAutoral` ({ original, efetiva, comparavel, lacunas }) sem confiar na forma. */
export function copyDaArte(fieldValues: Record<string, unknown> | null | undefined): CopyDaArte | null {
  const registro = fieldValues?.copyAutoral
  if (!registro || typeof registro !== 'object' || Array.isArray(registro)) return null
  const r = registro as Record<string, unknown>
  const original = lerCopyAutoral(r.original).copy
  if (!original) return null
  const efetiva = lerCopyAutoral(r.efetiva).copy
  const lacunas = Array.isArray(r.lacunas) ? r.lacunas.filter((l): l is string => typeof l === 'string') : []
  const enviada = Array.isArray(r.enviada) ? r.enviada.filter((t): t is string => typeof t === 'string') : null
  const c = r.conferencia && typeof r.conferencia === 'object' && !Array.isArray(r.conferencia) ? (r.conferencia as Record<string, unknown>) : null
  const conferencia: ConferenciaDaCopy | null = c
    ? {
        lida: Array.isArray(c.lida) ? c.lida.filter((t): t is string => typeof t === 'string') : [],
        faltando: Array.isArray(c.faltando) ? c.faltando.filter((t): t is string => typeof t === 'string') : [],
        passou: typeof c.passou === 'boolean' ? c.passou : null,
        regua: typeof c.regua === 'string' ? c.regua : 'desconhecida',
        ...(Array.isArray(c.grafiaDivergente) && c.grafiaDivergente.length > 0 ? { grafiaDivergente: c.grafiaDivergente as Array<{ esperado: string; lido: string }> } : {}),
      }
    : null
  // Sem `enviada` (o prompt não deixou dizer o que foi — PR5-10) a comparação
  // continua sendo por visão quando a conferência rodou.
  const porVisao = !efetiva && (!!enviada || !!conferencia)
  return {
    comparavel: r.comparavel === true && (!!efetiva || (porVisao && !!conferencia && conferencia.passou !== null)),
    ...(efetiva ? { comparadoPor: 'camadas' as const } : porVisao ? { comparadoPor: 'visao' as const } : {}),
    original: resumoDosBlocos(original),
    ...(enviada ? { enviada } : {}),
    desenhada: efetiva ? resumoDosBlocos(efetiva) : [],
    ...(conferencia ? { conferencia } : {}),
    blocosDiferentes: efetiva ? diferencasDeBlocos(original, efetiva).filter((m) => !m.campos || m.campos.includes('linhas')).map((m) => m.id) : [],
    lacunas: efetiva || porVisao ? lacunas : [...lacunas, 'a copy desenhada não foi registrada nesta arte'],
  }
}

export interface PaginaDaGeracao {
  id: string
  name: string
  templateId: number
  isTemplate: boolean
  /** CP5b: os campos de `identidadeDaPagina`, quando o handler os leu (bloco `gate`); sem eles a validade é `ilegivel`. */
  tags?: string[]
  width?: number
  height?: number
  background?: string | null
  layers?: unknown
  copyAutoral?: unknown
}

/** Frase fixa de todo bloco `gate` (CP5b § 6): o registro é auditoria, nunca o veredito de agora. */
export const AVISO_DO_GATE = 'último veredito gravado; não é o veredito atual da arte — quem precisa do veredito atual mede de novo; nunca agende por ele'

export type BlocoDoGate =
  /** Há um valor na chave mas ele não se lê (ou a página não dá para comparar): NENHUM resultado é exibido; só as versões gravadas, quando legíveis. */
  | { validade: 'ilegivel'; motivo: string; versaoGravada?: string; rulesVersionGravada?: string; aviso: string }
  | {
      validade: 'coincidente' | 'historico'
      resultado: GateDaArte['resultado']
      rulesVersion: string
      versaoDoGate: string
      medidoEm: string
      origem: OrigemDoGate
      /** A política com que o veredito foi calculado (gravada) e a que o leitor comparou (a RECOMENDADA, nomeada — 9.7/9.12). */
      politica: PoliticaDoAssunto
      politicaComparada: PoliticaDoAssunto
      naoConferido?: readonly string[]
      divergencias?: DivergenciaDoGate[]
      motivos: GateDaArte['motivos']
      aviso: string
    }

/**
 * CP5b § 6 — o bloco `gate` de `ver-geracao`, só leitura. `null` = sem registro (não "APTO", não "pendente"). A
 * identidade de hoje sai da página lida pelo handler (`identidadeDaPagina`); `atual` leva `VERSAO_DAS_REGRAS`,
 * `VERSAO_DO_GATE` e a política recomendada. Nada aqui decide coisa alguma.
 */
export function blocoDoGate(args: { fieldValues: Record<string, unknown> | null | undefined; generationId: string; projectId: number; pagina: PaginaDaGeracao | null }): BlocoDoGate | null {
  const leitura = lerGateDaArte(args.fieldValues ?? {})
  if (leitura.estado === 'ausente') return null
  if (leitura.estado === 'invalido') {
    const { motivo, versaoGravada, rulesVersionGravada } = leitura
    return { validade: 'ilegivel', motivo, ...(versaoGravada ? { versaoGravada } : {}), ...(rulesVersionGravada ? { rulesVersionGravada } : {}), aviso: AVISO_DO_GATE }
  }
  const { registro } = leitura
  const p = args.pagina
  if (!p || typeof p.width !== 'number' || typeof p.height !== 'number' || !Array.isArray(p.tags) || p.layers === undefined) {
    return { validade: 'ilegivel', motivo: 'página indisponível para comparar a identidade', aviso: AVISO_DO_GATE }
  }
  const id = identidadeDaPagina({ id: p.id, name: p.name, tags: p.tags, width: p.width, height: p.height, background: p.background ?? null, layers: p.layers, copyAutoral: p.copyAutoral })
  const validade = validadeDoGate(registro, {
    projectId: args.projectId,
    generationId: args.generationId,
    pageId: id.pageId,
    formato: id.formato,
    formatoDoCompositor: id.formatoDoCompositor,
    pageVersion: id.pageVersion,
    copyVersion: id.copyVersion,
    rulesVersion: VERSAO_DAS_REGRAS,
    versaoDoGate: VERSAO_DO_GATE,
    politica: POLITICA_DO_ASSUNTO_RECOMENDADA,
  })
  if (validade.estado === 'ilegivel') return { validade: 'ilegivel', motivo: validade.motivo, aviso: AVISO_DO_GATE }
  return {
    validade: validade.estado,
    resultado: registro.gate.resultado,
    rulesVersion: registro.gate.rulesVersion,
    versaoDoGate: registro.gate.versao,
    medidoEm: registro.medidoEm,
    origem: registro.origem,
    politica: registro.politica,
    politicaComparada: POLITICA_DO_ASSUNTO_RECOMENDADA,
    ...(validade.estado === 'coincidente' ? { naoConferido: validade.naoConferido } : { divergencias: validade.divergencias }),
    motivos: registro.gate.motivos,
    aviso: AVISO_DO_GATE,
  }
}

export interface RetornoDaPagina {
  pageId?: string
  pagina?: string
  editUrl?: string
  /** A página gravada na arte não existe mais (apagada) — só o id fica. */
  paginaApagada?: true
  /** Avisos do compositor (`fieldValues.composicao.avisos`), quando houver. */
  avisosDoCompositor?: string[]
  /** A copy escrita × a desenhada, quando a arte carrega o contrato (F1). */
  copy?: CopyDaArte
  comoAgendar?: string
  /** CP5b: o último veredito GRAVADO do gate, rotulado (só quando o handler passa `generationId`); `null` = sem registro. */
  gate?: BlocoDoGate | null
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
  /** CP5b: com ele, o retorno traz o bloco `gate` (auditoria, só leitura). */
  generationId?: string
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
  const copy = copyDaArte(fv)
  if (copy) saida.copy = copy
  if (args.generationId !== undefined) saida.gate = blocoDoGate({ fieldValues: fv, generationId: args.generationId, projectId: args.projectId, pagina: args.pagina })
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
