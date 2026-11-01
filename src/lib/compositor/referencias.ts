/**
 * A CAMADA DE SERVIÇO das referências de layout (F1 da direção por referência, 01/11/2026): aprova uma página como
 * referência (compila, valida contra o PISO DO PROJETO e grava a revisão imutável), lista e revoga, e entrega ao
 * núcleo puro (`prepararArquetipo`/`resolverArquetipo`, opção `definicoes`) as definições do cliente.
 *
 * O gate por cliente/formato é AQUI, no servidor: a spec só resolve `ref-<pageId>` se a revisão é do projeto da spec;
 * um pedido novo só vê as não revogadas; a recomposição (`persistida`) vê todas — a peça fixou id + versão +
 * impressão quando nasceu, e revogar não a apaga.
 *
 * Aprovar é curadoria (dono/curador do projeto, gate da porta MCP), separada da edição comum da página: a página
 * viva pode seguir sendo editada sem mudar o que o compositor lê; aprovar de novo cria a versão seguinte.
 */
import { db } from '@/lib/db'
import { CreativeError } from '@/lib/creatives/errors'
import { versaoDaPagina } from '@/lib/creatives/revisao/versao'
import { parsePageLayers } from '@/lib/posts/page-layers'
import type { Layer } from '@/types/template'
import { impressaoDoArquetipo } from './arquetipos/impressao'
import { compilarReferencia, ehIdDeReferencia, idDaReferencia, type CompilacaoDaReferencia, type LeituraDaReferencia } from './arquetipos/referencia'
import type { ArquetipoDeLayout, FormatoDoArquetipo } from './arquetipos/tipos'
import { validarArquetipo } from './arquetipos/validar'
import { pisoDoProjetoDe } from './geometria'
import { DIMENSOES, type Formato } from './spec'

/**
 * As definições que a RESOLUÇÃO de uma spec precisa: só quando o pedido é `ref-…` (o catálogo resolve o resto sem ir
 * ao banco — composição de catálogo não toca a tabela). Pedido novo: só as não revogadas; `incluirRevogadas` para a
 * composição pelo worker e a recomposição, que já carregam id + versão + impressão fixados.
 */
export async function definicoesParaASpec(spec: { projectId?: number; arquetipo?: { id?: string } | null }, opcoes: { incluirRevogadas?: boolean } = {}): Promise<ArquetipoDeLayout[]> {
  const id = spec.arquetipo?.id
  // `z.infer` com strict:false marca `projectId` opcional; a spec validada sempre o tem — sem ele não há cliente a consultar.
  if (typeof id !== 'string' || !ehIdDeReferencia(id) || typeof spec.projectId !== 'number') return []
  return referenciasDoProjeto(spec.projectId, opcoes)
}

export interface RevisaoDeReferencia {
  id: string
  pageId: string
  arquetipoId: string
  versao: number
  formato: string
  impressao: string
  pageVersion: string
  aprovadaEm: Date
  revogadaEm: Date | null
}

/**
 * As definições do cliente para o núcleo puro. Pedido NOVO: só as não revogadas; `incluirRevogadas` (recomposição e
 * composição pelo worker, que já carregam id + versão + impressão fixados): todas. Linha cuja impressão não bate com a
 * definição gravada é recusada, nunca pulada em silêncio.
 */
export async function referenciasDoProjeto(projectId: number, opcoes: { formato?: Formato; incluirRevogadas?: boolean } = {}): Promise<ArquetipoDeLayout[]> {
  const linhas = await db.referenciaDeLayout.findMany({
    where: { projectId, ...(opcoes.formato ? { formato: opcoes.formato } : {}), ...(opcoes.incluirRevogadas ? {} : { revogadaEm: null }) },
    select: { arquetipoId: true, versao: true, impressao: true, definicao: true },
    orderBy: [{ arquetipoId: 'asc' }, { versao: 'asc' }],
  })
  return linhas.map((l) => {
    const definicao = l.definicao as unknown as ArquetipoDeLayout
    const impressao = impressaoDoArquetipo(definicao)
    if (impressao !== l.impressao || definicao.id !== l.arquetipoId || definicao.versao !== l.versao) {
      throw new CreativeError('REFERENCIA_CORROMPIDA', `A revisão ${l.arquetipoId}@${l.versao} não reproduz a impressão gravada (${l.impressao} ≠ ${impressao}): a referência não pode ser usada.`, 500, { arquetipoId: l.arquetipoId, versao: l.versao })
    }
    return definicao
  })
}

export async function listarReferencias(projectId: number): Promise<Array<RevisaoDeReferencia & { pagina: string | null }>> {
  const linhas = await db.referenciaDeLayout.findMany({
    where: { projectId },
    select: { id: true, pageId: true, arquetipoId: true, versao: true, formato: true, impressao: true, pageVersion: true, aprovadaEm: true, revogadaEm: true },
    orderBy: [{ arquetipoId: 'asc' }, { versao: 'desc' }],
  })
  const paginas = await db.page.findMany({ where: { id: { in: [...new Set(linhas.map((l) => l.pageId))] } }, select: { id: true, name: true } })
  const nome = new Map(paginas.map((p) => [p.id, p.name]))
  return linhas.map((l) => ({ ...l, pagina: nome.get(l.pageId) ?? null }))
}

export interface AprovacaoDeReferencia {
  arquetipo: { id: string; versao: number; impressao: string }
  revisao: RevisaoDeReferencia
  leitura: LeituraDaReferencia
  /** A página não mudou desde a revisão vigente: nada foi gravado, a revisão é a mesma. */
  reaproveitada: boolean
}

/** Aprova a página como referência do cliente: compila, valida contra o piso do projeto e grava a revisão seguinte. */
export async function aprovarReferencia(args: { projectId: number; pageId: string; aprovadaPor: string | null }): Promise<AprovacaoDeReferencia> {
  const [page, projeto] = await Promise.all([
    db.page.findUnique({ where: { id: args.pageId }, select: { id: true, name: true, width: true, height: true, tags: true, layers: true, background: true, Template: { select: { projectId: true } } } }),
    db.project.findUnique({ where: { id: args.projectId }, select: { id: true, assinatura: true } }),
  ])
  if (!projeto) throw new CreativeError('PROJECT_NOT_FOUND', `Projeto ${args.projectId} não encontrado`, 404)
  if (!page || page.Template.projectId !== args.projectId) throw new CreativeError('PAGE_NOT_FOUND', 'Página não encontrada neste cliente.', 404)
  const pageVersion = versaoDaPagina(page)
  if (!pageVersion) throw new CreativeError('REFERENCIA_PAGINA_ILEGIVEL', 'As camadas da página não são legíveis: nada foi aprovado.', 422)

  const arquetipoId = idDaReferencia(page.id)
  const anteriores = await db.referenciaDeLayout.findMany({ where: { arquetipoId }, orderBy: { versao: 'desc' }, select: { id: true, pageId: true, arquetipoId: true, versao: true, formato: true, impressao: true, pageVersion: true, aprovadaEm: true, revogadaEm: true, definicao: true } })
  const vigente = anteriores[0]
  const camadas = parsePageLayers(page.layers) as unknown as Layer[]
  const versao = (vigente?.versao ?? 0) + 1
  const compilada = compilarReferencia({ id: page.id, name: page.name, width: page.width, height: page.height, tags: page.tags, layers: camadas }, { pageVersion, versao })
  if (!compilada.ok) {
    const r = compilada as Extract<CompilacaoDaReferencia, { ok: false }>
    throw new CreativeError(r.codigo, r.mensagem, 422, r.detalhes)
  }
  const { definicao, leitura } = compilada

  // Idempotente: a mesma página (versão) já aprovada e vigente é a mesma revisão — nada a gravar.
  if (vigente && !vigente.revogadaEm && vigente.pageVersion === pageVersion && impressaoDoArquetipo({ ...(vigente.definicao as unknown as ArquetipoDeLayout), versao }) === impressaoDoArquetipo(definicao)) {
    const { definicao: _d, ...revisao } = vigente
    return { arquetipo: { id: arquetipoId, versao: vigente.versao, impressao: vigente.impressao }, revisao, leitura, reaproveitada: true }
  }

  // Validada contra o PISO DO PROJETO (não o padrão): é o piso que vai recortar a zona na composição.
  const formato = leitura.formato
  const piso = pisoDoProjetoDe(projeto.assinatura)[formato]
  const { width, height } = DIMENSOES[formato]
  const problemas = validarArquetipo(definicao, { formatos: [formato], areaSegura: { [formato]: { largura: width, altura: height, margemH: piso.margemH, safeTopo: piso.safeTopo, safeRodape: piso.safeRodape } } })
  if (problemas.length > 0) {
    throw new CreativeError('REFERENCIA_INVALIDA', `A página não serve de referência como está: ${problemas.map((p) => `${p.campo}: ${p.mensagem}`).join('; ')}. Ajuste a página (ou o piso do projeto) e aprove de novo.`, 422, { problemas, piso, leitura })
  }
  const impressao = impressaoDoArquetipo(definicao)
  const criada = await db.referenciaDeLayout.create({
    data: { projectId: args.projectId, pageId: page.id, formato, arquetipoId, versao, impressao, pageVersion, definicao: definicao as never, aprovadaPor: args.aprovadaPor },
    select: { id: true, pageId: true, arquetipoId: true, versao: true, formato: true, impressao: true, pageVersion: true, aprovadaEm: true, revogadaEm: true },
  })
  return { arquetipo: { id: arquetipoId, versao, impressao }, revisao: criada, leitura, reaproveitada: false }
}

/** Revoga as revisões vigentes da página (ou só uma versão): pedidos novos deixam de resolvê-la; peças que nasceram dela seguem recompondo. */
export async function revogarReferencia(args: { projectId: number; pageId: string; versao?: number }): Promise<{ revogadas: number }> {
  const r = await db.referenciaDeLayout.updateMany({
    where: { projectId: args.projectId, arquetipoId: idDaReferencia(args.pageId), revogadaEm: null, ...(args.versao !== undefined ? { versao: args.versao } : {}) },
    data: { revogadaEm: new Date() },
  })
  return { revogadas: r.count }
}

export type { FormatoDoArquetipo }
