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
import type { OpcoesDeResolucao } from './arquetipos/na-spec'
import type { ArquetipoDeLayout, FormatoDoArquetipo } from './arquetipos/tipos'
import { validarArquetipo } from './arquetipos/validar'
import { formatoDaPaginaGravada } from './formato'
import { pisoDoProjetoDe } from './geometria'
import { DIMENSOES, type Formato } from './spec'

/**
 * O que a RESOLUÇÃO de uma spec precisa (`prepararArquetipo`/`resolverArquetipo`): as definições do cliente e o gate
 * do catálogo. Nada vai ao banco sem `spec.arquetipo`.
 *
 * - Pedido NOVO (default — fila, medir-copy, compor-arte direto, executar-plano): só as revisões VIGENTES do cliente
 *   no formato da spec; e, se ele tem alguma, o catálogo fica BLOQUEADO (`ARQUETIPO_NAO_APROVADO`) — é o gate da F3
 *   antecipado, no servidor. Cliente sem referência continua no catálogo (legado, dito).
 * - `reproducao` (worker da fila, recomposição): o pedido já fixou id + versão + impressão; as revogadas resolvem e o
 *   catálogo fica aberto. Só consulta a tabela quando o id é `ref-…`.
 */
export async function resolucaoParaASpec(
  spec: { projectId?: number; formato?: string; arquetipo?: { id?: string; versao?: number; impressao?: string } | null },
  opcoes: { reproducao?: boolean; cliente?: LeitorDeReferencias } = {},
): Promise<Pick<OpcoesDeResolucao, 'definicoes' | 'catalogoBloqueado'>> {
  const id = spec.arquetipo?.id
  // `z.infer` com strict:false marca `projectId` opcional; a spec validada sempre o tem — sem ele não há cliente a consultar.
  if (typeof id !== 'string' || typeof spec.projectId !== 'number') return {}
  // Quem resolve de DENTRO de uma transação (a reserva do lote, `resolverAgora(tx)`) lê pela transação: com o pooler em
  // `connection_limit=1`, a consulta pelo cliente global esperaria pela conexão que a própria transação segura (Codex, rodada 4).
  const cliente = opcoes.cliente
  if (opcoes.reproducao) return ehIdDeReferencia(id) ? { definicoes: await referenciasDoProjeto(spec.projectId, { incluirRevogadas: true, cliente }) } : {}
  const formato = spec.formato === 'story' || spec.formato === 'feed' ? spec.formato : undefined
  // Formato que nenhum arquétipo define (quadrado): o catálogo não é bloqueado (a recusa certa é a do formato), e a
  // referência pedida resolve entre todas as vigentes para a recusa também ser a do formato.
  if (!formato) return ehIdDeReferencia(id) ? { definicoes: await referenciasDoProjeto(spec.projectId, { cliente }) } : {}
  const vigentes = await referenciasDoProjeto(spec.projectId, { formato, cliente })
  if (vigentes.length === 0 || ehIdDeReferencia(id)) return { definicoes: vigentes }
  return {
    definicoes: vigentes,
    catalogoBloqueado: { motivo: `o cliente tem ${vigentes.length} referência(s) aprovada(s) no ${formato} (${vigentes.map((a) => `${a.id}@${a.versao}`).join(', ')}) — peça uma delas em arquetipo.id (listar-referencias)` },
  }
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
/** O cliente Prisma que lê: o global, ou a TRANSAÇÃO de quem chama de dentro de uma (a reserva do lote) — ver `LeitorDeReferencias`. */
export type LeitorDeReferencias = Pick<typeof db, 'referenciaDeLayout'>

export async function referenciasDoProjeto(projectId: number, opcoes: { formato?: Formato; incluirRevogadas?: boolean; cliente?: LeitorDeReferencias } = {}): Promise<ArquetipoDeLayout[]> {
  const linhas = await (opcoes.cliente ?? db).referenciaDeLayout.findMany({
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

export async function listarReferencias(projectId: number): Promise<Array<RevisaoDeReferencia & { pagina: string | null; corpos: Partial<Record<string, number>> | null; estilos: Partial<Record<string, unknown>> | null }>> {
  const linhas = await db.referenciaDeLayout.findMany({
    where: { projectId },
    select: { id: true, pageId: true, arquetipoId: true, versao: true, formato: true, impressao: true, pageVersion: true, aprovadaEm: true, revogadaEm: true, definicao: true },
    orderBy: [{ arquetipoId: 'asc' }, { versao: 'desc' }],
  })
  const paginas = await db.page.findMany({ where: { id: { in: [...new Set(linhas.map((l) => l.pageId))] } }, select: { id: true, name: true } })
  const nome = new Map(paginas.map((p) => [p.id, p.name]))
  // F2c: os corpos aprovados saem da REVISÃO PERSISTIDA (a definição gravada, no formato dela) — nunca recompilados.
  const campoDe = <T,>(definicao: unknown, formato: string, campo: 'corpos' | 'estilos'): T | null => {
    const d = definicao as { formatos?: Record<string, Record<string, unknown>> } | null
    const c = d?.formatos?.[formato]?.[campo]
    return c && typeof c === 'object' ? (c as T) : null
  }
  // F2d: `estilos` (o estilo desenhado por papel) também sai da revisão persistida; null nas revisões de antes.
  return linhas.map(({ definicao, ...l }) => ({ ...l, pagina: nome.get(l.pageId) ?? null, corpos: campoDe<Partial<Record<string, number>>>(definicao, l.formato, 'corpos'), estilos: campoDe<Partial<Record<string, unknown>>>(definicao, l.formato, 'estilos') }))
}

export interface AprovacaoDeReferencia {
  arquetipo: { id: string; versao: number; impressao: string }
  revisao: RevisaoDeReferencia
  leitura: LeituraDaReferencia
  /** A página não mudou desde a revisão vigente: nada foi gravado, a revisão é a mesma. */
  reaproveitada: boolean
}

/**
 * Aprova a página como referência do cliente: compila com o PISO DO PROJETO (toda caixa dentro dele), valida o
 * contrato, e grava a revisão seguinte. `versaoEsperada` (a `versaoDaPagina` que quem aprovou viu) recusa a aprovação
 * de uma página editada depois da conferência. Idempotente: a mesma versão da página já vigente não grava de novo —
 * conferida DEPOIS da validação (mudar o piso e reapresentar a página revalida). Duas aprovações concorrentes: a que
 * perde o índice único relê e reaproveita a revisão equivalente, ou recusa com o motivo.
 */
export async function aprovarReferencia(args: { projectId: number; pageId: string; aprovadaPor: string | null; versaoEsperada?: string }): Promise<AprovacaoDeReferencia> {
  const [page, projeto] = await Promise.all([
    db.page.findUnique({ where: { id: args.pageId }, select: { id: true, name: true, width: true, height: true, tags: true, layers: true, background: true, Template: { select: { projectId: true } } } }),
    db.project.findUnique({ where: { id: args.projectId }, select: { id: true, assinatura: true } }),
  ])
  if (!projeto) throw new CreativeError('PROJECT_NOT_FOUND', `Projeto ${args.projectId} não encontrado`, 404)
  if (!page || page.Template.projectId !== args.projectId) throw new CreativeError('PAGE_NOT_FOUND', 'Página não encontrada neste cliente.', 404)
  const pageVersion = versaoDaPagina(page)
  if (!pageVersion) throw new CreativeError('REFERENCIA_PAGINA_ILEGIVEL', 'As camadas da página não são legíveis: nada foi aprovado.', 422)
  if (args.versaoEsperada && args.versaoEsperada !== pageVersion) {
    throw new CreativeError('REFERENCIA_PAGINA_MUDOU', `A página mudou desde a versão conferida (${args.versaoEsperada} → ${pageVersion}): releia a página (revisar-arte devolve a versão) e aprove o que viu.`, 409, { versaoEsperada: args.versaoEsperada, versaoAtual: pageVersion })
  }
  const camadas = parsePageLayers(page.layers) as unknown as Layer[]
  const arquetipoId = idDaReferencia(page.id)
  const selecao = { id: true, pageId: true, arquetipoId: true, versao: true, formato: true, impressao: true, pageVersion: true, aprovadaEm: true, revogadaEm: true } as const

  const compilarEValidar = (versao: number) => {
    // O piso do PROJETO (não o padrão): é o que vai recortar a zona na composição — a caixa fora dele é recusa aqui.
    const pisos = pisoDoProjetoDe(projeto.assinatura)
    const formatoLido = formatoDaPaginaGravada({ tags: page.tags, width: page.width, height: page.height })
    const pisoDoFormato = formatoLido === 'story' || formatoLido === 'feed' ? pisos[formatoLido] : undefined
    const compilada = compilarReferencia({ id: page.id, name: page.name, width: page.width, height: page.height, tags: page.tags, layers: camadas }, { pageVersion, versao, ...(pisoDoFormato ? { piso: pisoDoFormato } : {}) })
    if (!compilada.ok) {
      const r = compilada as Extract<CompilacaoDaReferencia, { ok: false }>
      throw new CreativeError(r.codigo, r.mensagem, 422, r.detalhes)
    }
    const { definicao, leitura } = compilada
    const formato = leitura.formato
    const piso = pisos[formato]
    const { width, height } = DIMENSOES[formato]
    const problemas = validarArquetipo(definicao, { formatos: [formato], areaSegura: { [formato]: { largura: width, altura: height, margemH: piso.margemH, safeTopo: piso.safeTopo, safeRodape: piso.safeRodape } } })
    if (problemas.length > 0) {
      throw new CreativeError('REFERENCIA_INVALIDA', `A página não serve de referência como está: ${problemas.map((p) => `${p.campo}: ${p.mensagem}`).join('; ')}. Ajuste a página (ou o piso do projeto) e aprove de novo.`, 422, { problemas, piso, leitura })
    }
    return { definicao, leitura, formato, impressao: impressaoDoArquetipo(definicao) }
  }

  // DECIDIR (ler a vigente, compilar, validar, conferir a idempotência) é separado de INSERIR: a releitura depois de um
  // conflito decide sem gravar nada.
  const decidir = async () => {
    const anteriores = await db.referenciaDeLayout.findMany({ where: { arquetipoId }, orderBy: { versao: 'desc' }, take: 1, select: { ...selecao, definicao: true } })
    const vigente = anteriores[0]
    const versao = (vigente?.versao ?? 0) + 1
    const { definicao, leitura, formato, impressao } = compilarEValidar(versao)
    // Idempotente (depois de validar): a mesma página já aprovada e vigente é a mesma revisão — nada a gravar.
    if (vigente && !vigente.revogadaEm && vigente.pageVersion === pageVersion && impressaoDoArquetipo({ ...(vigente.definicao as unknown as ArquetipoDeLayout), versao }) === impressao) {
      const { definicao: _d, ...revisao } = vigente
      return { reaproveitada: true as const, resultado: { arquetipo: { id: arquetipoId, versao: vigente.versao, impressao: vigente.impressao }, revisao, leitura, reaproveitada: true } }
    }
    return { reaproveitada: false as const, versao, definicao, leitura, formato, impressao }
  }
  const inserir = async (d: Extract<Awaited<ReturnType<typeof decidir>>, { reaproveitada: false }>) => {
    const criada = await db.referenciaDeLayout.create({
      data: { projectId: args.projectId, pageId: page.id, formato: d.formato, arquetipoId, versao: d.versao, impressao: d.impressao, pageVersion, definicao: d.definicao as never, aprovadaPor: args.aprovadaPor },
      select: selecao,
    })
    return { arquetipo: { id: arquetipoId, versao: d.versao, impressao: d.impressao }, revisao: criada, leitura: d.leitura, reaproveitada: false }
  }
  const decisao = await decidir()
  if (decisao.reaproveitada) return decisao.resultado
  try {
    return await inserir(decisao as Extract<typeof decisao, { reaproveitada: false }>)
  } catch (e) {
    // Concorrência: outra aprovação ganhou `versao`. Reler decide SEM inserir — a equivalente reaproveita, a diferente é dita.
    if (!(e && typeof e === 'object' && (e as { code?: string }).code === 'P2002')) throw e
    const releitura = await decidir()
    if (releitura.reaproveitada) return releitura.resultado
    throw new CreativeError('REFERENCIA_CONCORRENTE', `Outra aprovação de ${arquetipoId} gravou uma revisão diferente ao mesmo tempo (a próxima seria v${releitura.versao}): confira listar-referencias e aprove de novo se ainda for o caso. Nada foi gravado por esta chamada.`, 409, { arquetipoId, proximaVersao: releitura.versao })
  }
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
