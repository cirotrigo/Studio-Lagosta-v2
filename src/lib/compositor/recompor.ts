/**
 * RECOMPOR a peça cuja página foi editada — o braço da invalidação para a arte
 * que o cron de render não alcança.
 *
 * O defeito (diagnosticado em 04/09/2026, projeto 8): editar a copy de um
 * SLIDE DE CARROSSEL no editor não fazia nada. O post continuava com o render
 * antigo em `mediaUrls` e publicaria o texto velho, em silêncio — 7 das 65
 * artes agendadas daquele dia estavam assim. A causa não é esquecimento: post
 * de carrossel é `NOT_NEEDED` de propósito, porque `renderPostArt` grava
 * `mediaUrls: [url]` e um post `RENDERED` de 5 slides perderia 4 no primeiro
 * re-render. A proteção evitava o estrago e abandonava a edição.
 *
 * Três regras carregam o risco desta operação:
 *
 * 1. 🔴 **Recompor, não só re-renderizar.** Re-renderizar a página como ela
 *    está reproduz a colisão: a caixa foi medida para o texto ANTIGO. Duas
 *    peças de 04/09 saíram com o apoio impresso por cima da manchete. O
 *    caminho é pegar a `spec` da geração, trocar só a copy pela que está na
 *    página e chamar `comporPeca`, que mede cada linha na fonte real e
 *    encolhe até caber.
 * 2. 🔴 **Gravar as camadas na MESMA página.** `comporPeca` sem `provar`
 *    criaria uma página nova (em outra pasta, com outro nome) e o post
 *    continuaria apontando para a antiga — editar de novo deixaria de ter
 *    efeito para sempre. Por isso a composição roda em `provar: true` e a
 *    gravação é feita aqui.
 * 3. 🔴 **Trocar SÓ o índice daquele slide**, com compare-and-swap sobre o
 *    array inteiro. A contagem de mídias nunca diminui — é a lição mais cara
 *    do repositório (`montarNovasMidias`), e vale igual aqui.
 *
 * O que NÃO se faz: mandar a peça andar sozinha além disso. Recusa do
 * compositor (`TEXTO_NAO_CABE_NA_COLUNA`) não vira arte quebrada nem log
 * mudo — ela é gravada na Generation e no histórico do post, com o orçamento
 * de caracteres, e quem editou decide.
 *
 * ⚠️ A recomposição REESCREVE `Page.layers`, e isso é deliberado: sem escrever,
 * o editor e a arte publicada divergiriam para sempre (o contrato "editor =
 * export"). O preço é que, se a pessoa continuar digitando, o autosave dela
 * escreve o estado do navegador por cima da geometria recomposta e enfileira
 * outra rodada. Converge assim que ela para: o último autosave entra, a última
 * recomposição roda depois dele, e a arte que publica está sempre certa.
 */

import { put } from '@vercel/blob'

import { db } from '@/lib/db'
import { pedirNovaTentativa } from '@/lib/ai/generation-queue'
import { copyDeCamadas } from '@/lib/aprendizado/diff-copy'
import { CreativeError } from '@/lib/creatives/errors'
import { prepararCamadasParaGravar } from '@/lib/creatives/layer-contract'
import { renderPageAndRegister } from '@/lib/creatives/persist'
import { invalidateScheduledRenders } from '@/lib/posts/invalidate-renders'
import { montarNovasMidias } from '@/lib/posts/troca-de-arte'
import { PostLogEvent } from '../../../prisma/generated/client'

import { comporPeca } from './compor'
import {
  medirDefasagem,
  precisaRefazer,
  slidesDaPagina,
  specComACopyDaPagina,
  type Defasagem,
  type SlideDefasado,
} from './defasagem'
import { validarSpec, type SpecDePeca } from './spec'

/** As situações de post que a recomposição alcança — as mesmas da invalidação. */
const SITUACOES_ALCANCADAS = ['DRAFT', 'SCHEDULED'] as const

/** Quantas URLs antigas de uma arte ficam guardadas para o resgate. */
const RASTRO_DE_URLS = 5

/** As URLs que esta arte já teve, gravadas em `fieldValues.recomposicao`. */
function urlsAnterioresDe(fieldValues: unknown): string[] {
  const fv = fieldValues && typeof fieldValues === 'object' ? (fieldValues as Record<string, unknown>) : {}
  const r = fv.recomposicao && typeof fv.recomposicao === 'object' ? (fv.recomposicao as Record<string, unknown>) : {}
  return Array.isArray(r.urlsAnteriores) ? r.urlsAnteriores.filter((u): u is string => typeof u === 'string') : []
}

export interface ArteDaPagina {
  generationId: string
  resultUrl: string
  spec: SpecDePeca | null
  snapshot: unknown
  fieldValues: Record<string, unknown>
  authorName: string | null
  sourcePageId: string | null
}

export interface LevantamentoDaPagina {
  pageId: string
  projectId: number
  nome: string
  /** A arte mais recente da página — a que a recomposição refaz. */
  arte: ArteDaPagina | null
  /** Todas as URLs de arte já geradas por esta página (a antiga pode estar no post). */
  urlsConhecidas: string[]
  defasagem: Defasagem
  /** (post, posição) que carregam a arte e a invalidação NÃO alcança. */
  slides: SlideDefasado[]
  /** Posts já entregues ao publicador: a edição não os alcança mais. */
  congelados: string[]
}

/**
 * Levanta a situação de uma página SEM escrever nada — é o que a varredura e o
 * dry-run do script usam, e o que o job confere antes de trabalhar.
 */
export async function levantarPagina(pageId: string): Promise<LevantamentoDaPagina | null> {
  const page = await db.page.findUnique({
    where: { id: pageId },
    select: {
      id: true,
      name: true,
      layers: true,
      isTemplate: true,
      Template: { select: { projectId: true } },
    },
  })
  if (!page) return null

  /**
   * `fieldValues.pageId` é gravado por `renderPageAndRegister` e só por ele —
   * ou seja, toda linha que volta daqui É um render desta página, e o
   * re-render pode reescrever o `resultUrl` dela sem medo. Arte DERIVADA
   * (melhoria, refazer) não entra: medido em 04/09/2026, 0 de 300 Generations
   * recentes com `sourceGenerationId` carregam `pageId`.
   */
  const geracoes = await db.generation.findMany({
    where: { fieldValues: { path: ['pageId'], equals: pageId } },
    select: { id: true, resultUrl: true, fieldValues: true, authorName: true, sourcePageId: true },
    orderBy: { createdAt: 'desc' },
    take: 20,
  })

  /**
   * As artes conhecidas desta página incluem as URLs que ela JÁ TEVE.
   *
   * Refazer a arte sobrescreve `Generation.resultUrl`, e a URL anterior some
   * do banco. Um post que perdeu o compare-and-swap (alguém mexeu nas mídias
   * no mesmo instante) ficaria com uma URL que nenhuma Generation tem mais —
   * invisível para toda varredura seguinte, publicando a arte velha para
   * sempre. Guardar o rastro é o que deixa a próxima passada alcançá-lo.
   */
  const urlsConhecidas = [
    ...new Set([
      ...geracoes.map((g) => g.resultUrl).filter((u): u is string => !!u),
      ...geracoes.flatMap((g) => urlsAnterioresDe(g.fieldValues)),
    ]),
  ]
  const primeira = geracoes.find((g) => !!g.resultUrl) ?? null
  const fv =
    primeira?.fieldValues && typeof primeira.fieldValues === 'object' && !Array.isArray(primeira.fieldValues)
      ? (primeira.fieldValues as Record<string, unknown>)
      : {}
  // A spec é revalidada: ela vem do banco, e uma spec que não passa hoje pelo
  // schema não pode virar composição — é melhor cair no re-render puro.
  const v = validarSpec(fv.spec)
  const arte: ArteDaPagina | null = primeira
    ? {
        generationId: primeira.id,
        resultUrl: primeira.resultUrl!,
        spec: v.spec,
        snapshot: fv.layersSnapshot,
        fieldValues: fv,
        authorName: primeira.authorName ?? null,
        sourcePageId: primeira.sourcePageId ?? null,
      }
    : null

  const projectId = page.Template.projectId
  const candidatos =
    urlsConhecidas.length > 0
      ? await db.socialPost.findMany({
          where: {
            projectId,
            status: { in: [...SITUACOES_ALCANCADAS] as never },
            mediaUrls: { hasSome: urlsConhecidas },
          },
          select: { id: true, pageId: true, renderStatus: true, mediaUrls: true, laterPostId: true },
        })
      : []

  return {
    pageId: page.id,
    projectId,
    nome: page.name,
    arte,
    urlsConhecidas,
    defasagem: medirDefasagem(page.layers, arte?.snapshot),
    slides: slidesDaPagina(
      candidatos.filter((p) => !p.laterPostId),
      urlsConhecidas,
      pageId,
    ),
    // Post já entregue ao publicador é INTOCÁVEL: o que vai ao ar é a cópia
    // que está no Zernio, e nada aqui fala com ele. Mesma regra (e mesma
    // razão) de `invalidateScheduledRenders`.
    congelados: candidatos.filter((p) => !!p.laterPostId).map((p) => p.id),
  }
}

export interface TrocaDeSlide {
  postId: string
  indice: number
  total: number
}

export interface ResultadoDaRecomposicao {
  pageId: string
  generationId: string | null
  /** Passou pelo compositor (mediu de novo), ou só re-renderizou como está. */
  recomposta: boolean
  /** A arte nova, quando houve. */
  url: string | null
  trocados: TrocaDeSlide[]
  naoTrocados: Array<{ postId: string; indice: number; motivo: string }>
  congelados: string[]
  /** Posts devolvidos à fila de render (os de imagem única desta página). */
  invalidados: number
  avisos: string[]
}

export interface RecomporInput {
  pageId: string
  /** `User.id` INTERNO (cuid), nunca o clerkId. Só auditoria no histórico do post. */
  decididoPor?: string | null
  /** De onde veio o pedido — `editor` (o PATCH) ou `varredura`. */
  origem?: 'editor' | 'varredura'
}

/**
 * Refaz a arte da página e troca, em cada post, SÓ a posição que a carregava.
 *
 * Nunca cria página, nunca cria post, nunca aprova nada. Quando não há slide
 * congelado apontando para esta página, sai sem escrever — é o caso comum, e
 * é o que deixa o job ser disparado a cada edição sem custo.
 */
export async function recomporPaginaDefasada(input: RecomporInput): Promise<ResultadoDaRecomposicao> {
  const { pageId } = input
  const origem = input.origem ?? 'editor'
  const levantamento = await levantarPagina(pageId)
  if (!levantamento) throw new CreativeError('PAGE_NOT_FOUND', `Página não encontrada: ${pageId}`, 404)

  const vazio: ResultadoDaRecomposicao = {
    pageId,
    generationId: levantamento.arte?.generationId ?? null,
    recomposta: false,
    url: null,
    trocados: [],
    naoTrocados: [],
    congelados: levantamento.congelados,
    invalidados: 0,
    avisos: [],
  }

  if (levantamento.slides.length === 0) return vazio
  if (!levantamento.arte) return { ...vazio, avisos: ['esta página não tem arte registrada para refazer'] }

  // Nada a fazer — ver `precisaRefazer`. É o que evita gastar um render num
  // empurrãozinho de 1px, e o que faz reverter uma peça já em dia sair calado.
  if (!precisaRefazer(levantamento.defasagem, levantamento.slides, levantamento.arte.resultUrl)) return vazio

  const page = await db.page.findUnique({
    where: { id: pageId },
    select: {
      id: true,
      name: true,
      width: true,
      height: true,
      layers: true,
      background: true,
      isTemplate: true,
      templateId: true,
      Template: { select: { id: true, name: true, projectId: true } },
    },
  })
  if (!page) throw new CreativeError('PAGE_NOT_FOUND', `Página não encontrada: ${pageId}`, 404)
  /**
   * Mesma recusa de `ajustarArte` e `reverterCamadasDaArte`: modelo é o layout
   * reutilizável do cliente, e reescrever as camadas dele apagaria curadoria.
   */
  if (page.isTemplate) {
    throw new CreativeError('PAGINA_E_MODELO', 'Esta página virou modelo do cliente; recompor apagaria a curadoria.', 409)
  }

  const projeto = await db.project.findUnique({
    where: { id: levantamento.projectId },
    select: { id: true, name: true, userId: true },
  })
  if (!projeto) throw new CreativeError('PROJECT_NOT_FOUND', `Projeto ${levantamento.projectId} não encontrado`, 404)

  const { arte, defasagem } = levantamento
  const avisos: string[] = []
  const rastro = [...urlsAnterioresDe(arte.fieldValues), arte.resultUrl].slice(-RASTRO_DE_URLS)
  /**
   * Recompor só quando a página ainda é a que o compositor pousou. Se alguém
   * moveu uma caixa, escondeu um bloco ou acrescentou camada, a recomposição
   * jogaria esse trabalho fora em silêncio — aí a arte é só re-renderizada
   * como está: a edição chega ao post do mesmo jeito (que é o defeito), e a
   * geometria fica por conta de quem mexeu.
   */
  const podeRecompor = !!arte.spec && !defasagem.ilegivel && defasagem.soTexto
  if (!podeRecompor && defasagem.mexidoNaMao.length > 0) {
    avisos.push(
      `A arte foi refeita SEM medir a diagramação de novo, porque a página foi ajustada à mão (${defasagem.mexidoNaMao.join('; ')}). ` +
        'Confira se algum texto ficou por cima de outro.',
    )
  }
  if (!podeRecompor && !arte.spec) {
    avisos.push('Esta arte não guardou a spec do compositor; ela foi re-renderizada como a página está.')
  }

  let novaUrl: string
  let recomposta = false
  let invalidados = 0

  if (podeRecompor) {
    const { spec, avisos: avisosDaSpec } = specComACopyDaPagina(arte.spec!, page.layers)
    avisos.push(...avisosDaSpec)
    /**
     * `provar: true` é obrigatório — ver a regra 2 do cabeçalho. Ele também
     * evita os efeitos colaterais da persistência do compositor: pasta da
     * semana, ordem na pasta, `registrarUsoDeFoto` e a transição do item do
     * plano. Recompor é refazer A MESMA peça, não criar outra.
     */
    const composicao = await comporPeca(spec, { provar: true })
    avisos.push(...composicao.diagnostico.avisos)
    if (!composicao.prova) throw new CreativeError('RENDER_VAZIO', 'A composição não devolveu imagem.', 500)

    const camadas = prepararCamadasParaGravar(composicao.layers)
    avisos.push(...camadas.avisos)
    const blob = await put(`arte-rapida/${projeto.id}/${page.id}-${Date.now()}.png`, composicao.prova, {
      access: 'public',
      contentType: 'image/png',
    })
    novaUrl = blob.url
    recomposta = true

    await db.page.update({
      where: { id: page.id },
      data: { layers: camadas.camadas as never, thumbnail: blob.url },
    })
    await db.generation.update({
      where: { id: arte.generationId },
      data: {
        resultUrl: blob.url,
        fieldValues: {
          ...arte.fieldValues,
          spec,
          composicao: composicao.diagnostico,
          layersSnapshot: camadas.camadas,
          thumbnailUrl: blob.url,
          recomposicao: registro('feita', { origem, papeis: defasagem.papeis, avisos, urlsAnteriores: rastro }),
        } as never,
      },
    })
  } else {
    /**
     * O re-render passa por `renderPageAndRegister` com o `generationId` da
     * própria arte: ele FECHA a Generation que já existe em vez de abrir
     * outra — é o que mantém a galeria limpa e o `SocialPost.generationId`
     * válido. `sourcePageId` e `authorName` vão de volta porque a rota os
     * SOBRESCREVE, e um deles nulo apagaria de qual modelo a arte nasceu.
     */
    const registrada = await renderPageAndRegister({
      project: projeto,
      templateId: page.Template.id,
      templateName: page.Template.name,
      page: {
        id: page.id,
        name: page.name,
        width: page.width,
        height: page.height,
        layers: page.layers,
        background: page.background,
      },
      authorName: arte.authorName ?? 'compositor',
      sourcePageId: arte.sourcePageId,
      generationId: arte.generationId,
      fieldValues: {
        ...arte.fieldValues,
        recomposicao: registro('re-renderizada', { origem, papeis: defasagem.papeis, avisos, urlsAnteriores: rastro }),
      },
    })
    novaUrl = registrada.url
  }

  const { trocados, naoTrocados } = await trocarNosPosts({
    slides: levantamento.slides,
    projectId: projeto.id,
    novaUrl,
    pageId,
    recomposta,
    decididoPor: input.decididoPor ?? null,
    origem,
  })

  /**
   * A página MUDOU depois da invalidação que o PATCH fez — e o cron pode ter
   * re-renderizado a versão anterior nesse meio-tempo. Devolver os posts de
   * imagem única à fila de novo é o que faz a arte deles convergir para a
   * página recomposta. Só no caminho que reescreve as camadas: no re-render a
   * página ficou como estava.
   */
  if (recomposta) {
    const r = await invalidateScheduledRenders(db, { pageIds: [pageId] })
    invalidados = r.invalidados
  }

  return {
    pageId,
    generationId: arte.generationId,
    recomposta,
    url: novaUrl,
    trocados,
    naoTrocados,
    congelados: levantamento.congelados,
    invalidados,
    avisos,
  }
}

/** O que fica gravado em `Generation.fieldValues.recomposicao`. */
function registro(estado: string, extras: Record<string, unknown>): Record<string, unknown> {
  return { estado, em: new Date().toISOString(), ...extras }
}

async function trocarNosPosts(args: {
  slides: SlideDefasado[]
  projectId: number
  novaUrl: string
  pageId: string
  recomposta: boolean
  decididoPor: string | null
  origem: string
}): Promise<{ trocados: TrocaDeSlide[]; naoTrocados: Array<{ postId: string; indice: number; motivo: string }> }> {
  const trocados: TrocaDeSlide[] = []
  const naoTrocados: Array<{ postId: string; indice: number; motivo: string }> = []

  for (const slide of args.slides) {
    // Releitura: entre o levantamento e agora o post pode ter sido aprovado,
    // entregue ao publicador ou ter tido a arte trocada por outro caminho.
    const post = await db.socialPost.findUnique({
      where: { id: slide.postId },
      select: { id: true, projectId: true, status: true, laterPostId: true, mediaUrls: true },
    })
    if (!post || post.projectId !== args.projectId) {
      naoTrocados.push({ postId: slide.postId, indice: slide.indice, motivo: 'o post não existe mais' })
      continue
    }
    if (post.laterPostId) {
      naoTrocados.push({ postId: post.id, indice: slide.indice, motivo: 'já foi entregue ao publicador' })
      continue
    }

    const midias = (post.mediaUrls ?? []).map(String)
    // A posição é reencontrada pela URL, não reusada do levantamento: uma
    // troca no meio do caminho pode ter deslocado a lista.
    const indice = midias.indexOf(slide.urlAntiga)
    if (indice < 0) {
      naoTrocados.push({ postId: post.id, indice: slide.indice, motivo: 'esta arte já não está no post' })
      continue
    }

    const novas = montarNovasMidias(midias, indice, args.novaUrl)
    const escrito = await db.socialPost.updateMany({
      where: {
        id: post.id,
        projectId: args.projectId,
        status: { in: [...SITUACOES_ALCANCADAS] as never },
        laterPostId: null,
        // Compare-and-swap sobre a lista INTEIRA: se alguém mexeu nas mídias
        // no meio do caminho, esta escrita desiste em vez de ressuscitar a
        // lista velha.
        mediaUrls: { equals: midias },
      },
      data: { mediaUrls: novas },
    })
    if (escrito.count === 0) {
      naoTrocados.push({ postId: post.id, indice, motivo: 'o post mudou enquanto a arte era refeita' })
      continue
    }

    trocados.push({ postId: post.id, indice, total: novas.length })
    await registrarNoHistorico(post.id, {
      message:
        (novas.length > 1
          ? `Imagem ${indice + 1}/${novas.length} atualizada: a página foi editada e a arte foi ${args.recomposta ? 'recomposta' : 're-renderizada'}.`
          : `Arte atualizada: a página foi editada e ${args.recomposta ? 'recomposta' : 're-renderizada'}.`),
      metadata: {
        de: slide.urlAntiga,
        para: args.novaUrl,
        indice,
        pageId: args.pageId,
        recomposta: args.recomposta,
        origem: args.origem,
        decididoPor: args.decididoPor,
      },
    })
  }

  return { trocados, naoTrocados }
}

/**
 * O histórico do post — o canal em que a equipe descobre, NA AGENDA, que a
 * arte mudou (ou por que não mudou). Nunca derruba a operação: quando isto
 * roda, a arte já está trocada.
 */
async function registrarNoHistorico(
  postId: string,
  entrada: { message: string; metadata: Record<string, unknown> },
): Promise<void> {
  try {
    await db.postLog.create({
      data: { postId, event: PostLogEvent.EDITED, message: entrada.message, metadata: entrada.metadata as never },
    })
  } catch (erro) {
    console.error('[recompor] não deu para gravar o histórico do post:', erro)
  }
}

export interface PedidoDeRecomposicao {
  jobId: string
  generationId: string
  /** Quantas posições de post carregam a arte antiga. */
  slides: number
}

/**
 * Põe a página na fila para ter a arte refeita — o gesto que toda porta que
 * muda o visual de uma página faz, ao lado de `invalidateScheduledRenders`.
 *
 * Devolve `null` quando não há nada congelado apontando para esta página, que
 * é o caso comum: peça de imagem única já é atendida pela invalidação, e
 * página que ainda não virou post não tem o que trocar. Sair aqui é o que
 * deixa o autosave chamar isto a cada edição sem custo.
 */
export async function enfileirarRecomposicaoDaPagina(args: {
  pageId: string
  origem: 'editor' | 'varredura'
}): Promise<PedidoDeRecomposicao | null> {
  const levantamento = await levantarPagina(args.pageId)
  if (!levantamento?.arte || levantamento.slides.length === 0) return null
  // A MESMA pergunta que o serviço faz, feita antes de criar o job: sem isto
  // toda mexida sem consequência acordaria o cron para não fazer nada.
  if (!precisaRefazer(levantamento.defasagem, levantamento.slides, levantamento.arte.resultUrl)) return null

  const { enfileirarRecomposicao } = await import('@/lib/ai/generation-queue')
  const jobId = await enfileirarRecomposicao({
    generationId: levantamento.arte.generationId,
    projectId: levantamento.projectId,
    recompor: { pageId: args.pageId, origem: args.origem },
  })
  return { jobId, generationId: levantamento.arte.generationId, slides: levantamento.slides.length }
}

/**
 * O COMPANHEIRO de `invalidateScheduledRenders` — quem muda o visual de uma
 * página precisa chamar os DOIS.
 *
 * A invalidação devolve à fila de render o post que RENDERIZA da página
 * (imagem única); esta função refaz a arte CONGELADA de quem não renderiza (o
 * slide de carrossel, a arte agendada por `generationId`). Cada uma sozinha
 * deixa metade das artes publicando o texto velho, e foi exatamente por a
 * regra viver em dois lugares que a rota de página ficou para trás em 2026 —
 * está escrito no cabeçalho de `invalidate-renders.ts`.
 *
 * Nunca lança e nunca segura quem chamou: é enfileiramento, e o desfecho da
 * arte não pode derrubar a escrita da página. Fora de qualquer transação — o
 * job precisa enxergar a página já gravada.
 */
export async function pedirRecomposicaoDaArteCongelada(
  pageIds: string[],
  origem: 'editor' | 'varredura' = 'editor',
): Promise<PedidoDeRecomposicao[]> {
  const pedidos: PedidoDeRecomposicao[] = []
  for (const pageId of [...new Set(pageIds)]) {
    try {
      const pedido = await enfileirarRecomposicaoDaPagina({ pageId, origem })
      if (!pedido) continue
      pedidos.push(pedido)
      console.log(`[recompor] página ${pageId}: ${pedido.slides} arte(s) congelada(s) na fila (job ${pedido.jobId})`)
    } catch (erro) {
      console.error(`[recompor] não deu para enfileirar a recomposição da página ${pageId}:`, erro)
    }
  }
  return pedidos
}

/**
 * O runner do job de RECOMPOSIÇÃO (`kind: COMPOR` com `recompor` no payload).
 *
 * Só LANÇA quando a falha é definitiva: `executarJob` embrulha o throw em
 * `falharJob`, com o motivo escrito. Sair normalmente deixa `fecharJob` ler a
 * Generation — que segue COMPLETED, porque a arte existe: numa recomposição
 * que falha, o que fica velho é a arte, não o registro dela.
 */
export async function processarRecomposicaoEmBackground(args: {
  generationId: string
  projectId: number
  recompor: { pageId: string; origem: 'editor' | 'varredura' }
  decididoPor?: string | null
  queueJobId?: string | null
}): Promise<void> {
  const { pageId, origem } = args.recompor
  const t0 = Date.now()
  const copyAntes = await copyDaPagina(pageId)

  try {
    const r = await recomporPaginaDefasada({ pageId, origem, decididoPor: args.decididoPor ?? null })
    console.log(
      `[recompor] ${pageId} em ${Math.round((Date.now() - t0) / 1000)}s — ${r.recomposta ? 'recomposta' : 're-renderizada'}, ` +
        `${r.trocados.length} slide(s) trocado(s)` +
        (r.naoTrocados.length ? `, ${r.naoTrocados.length} não trocado(s)` : '') +
        (r.congelados.length ? `, ${r.congelados.length} congelado(s)` : '') +
        (r.avisos.length ? ` | avisos: ${r.avisos.join(' · ')}` : ''),
    )

    /**
     * A página mudou DE NOVO enquanto a arte era refeita — alguém continuou
     * digitando. Sem isto a última edição ficaria de fora em silêncio, que é
     * o defeito de origem com outra roupa. `pedirNovaTentativa` respeita o
     * teto de tentativas do job, então o laço é limitado por construção; a
     * edição seguinte reabre o job do zero.
     */
    const copyDepois = await copyDaPagina(pageId)
    if (copyAntes && copyDepois && JSON.stringify(copyAntes) !== JSON.stringify(copyDepois)) {
      const voltou = await pedirNovaTentativa(args.queueJobId, 'a página foi editada de novo enquanto a arte era refeita')
      if (voltou) console.log(`[recompor] ${pageId} voltou à fila: a página mudou durante a recomposição`)
    }
  } catch (erro) {
    const msg = erro instanceof Error ? erro.message : String(erro)
    const code = erro instanceof CreativeError ? erro.code : 'ERRO'
    console.error(`[recompor] ${pageId} falhou (${code}): ${msg}`)
    /**
     * Erro determinístico — spec, assinatura, página virada modelo, e a recusa
     * por texto que não cabe — não melhora tentando de novo. Erro de infra
     * (foto, fonte, Blob, render) ganha outra tentativa.
     */
    const deterministico = [
      'SPEC_INVALIDA',
      'ASSINATURA_INCOMPLETA',
      'TEXTO_NAO_CABE_NA_COLUNA',
      'TEXTO_NAO_CABE',
      'PAGINA_E_MODELO',
      'PAGE_NOT_FOUND',
      'PROJECT_NOT_FOUND',
    ].includes(code)
    if (!deterministico && (await pedirNovaTentativa(args.queueJobId, msg))) return

    const levantamento = await levantarPagina(pageId).catch(() => null)
    const slides: SlideDefasado[] = levantamento?.slides ?? []
    await registrarRecusa({
      pageId,
      generationId: levantamento?.arte?.generationId ?? null,
      postIds: [...new Set(slides.map((s) => s.postId))],
      erro,
    })
    // Relança: é o que faz `executarJob` marcar o job FAILED com o motivo.
    throw erro
  }
}

/** A copy da página hoje — `null` quando ela sumiu ou está ilegível. */
async function copyDaPagina(pageId: string): Promise<Record<string, string> | null> {
  const page = await db.page.findUnique({ where: { id: pageId }, select: { layers: true } })
  return page ? copyDeCamadas(page.layers) : null
}

/**
 * A RECUSA do compositor chega a quem editou.
 *
 * `TEXTO_NAO_CABE_NA_COLUNA` é uma resposta correta — a linha digitada não
 * cabe na coluna nem a 80% da fonte —, e ela não pode virar log. Fica gravada
 * na Generation (que a galeria e `ver-geracao` leem) e no histórico de cada
 * post afetado, com o orçamento de caracteres, dizendo que a arte continua
 * sendo a antiga.
 */
export async function registrarRecusa(args: {
  pageId: string
  generationId: string | null
  postIds: string[]
  erro: unknown
}): Promise<void> {
  const erro = args.erro
  const code = erro instanceof CreativeError ? erro.code : 'ERRO'
  const mensagem = erro instanceof Error ? erro.message : String(erro)
  const detalhes = erro instanceof CreativeError ? erro.details : undefined

  if (args.generationId) {
    try {
      const atual = await db.generation.findUnique({
        where: { id: args.generationId },
        select: { fieldValues: true },
      })
      const fv =
        atual?.fieldValues && typeof atual.fieldValues === 'object' && !Array.isArray(atual.fieldValues)
          ? (atual.fieldValues as Record<string, unknown>)
          : {}
      // MERGE, nunca substituição: `fieldValues` é o registro atômico da run.
      await db.generation.update({
        where: { id: args.generationId },
        data: {
          fieldValues: {
            ...fv,
            recomposicao: registro('recusada', { erro: mensagem, errorCode: code, detalhes }),
          } as never,
        },
      })
    } catch (falha) {
      console.error('[recompor] não deu para registrar a recusa na arte:', falha)
    }
  }

  for (const postId of args.postIds) {
    await registrarNoHistorico(postId, {
      message: `A arte NÃO foi atualizada: ${mensagem} A imagem continua sendo a anterior — ajuste o texto na página e salve de novo.`,
      metadata: { pageId: args.pageId, errorCode: code, detalhes: detalhes ?? null },
    })
  }
}
