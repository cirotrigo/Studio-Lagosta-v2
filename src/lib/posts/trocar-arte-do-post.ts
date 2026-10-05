/**
 * Trocar a ARTE de um rascunho da agenda.
 *
 * Até aqui não havia caminho para isso. `editarPost` muda legenda e tipo e
 * manda "para trocar a arte use ajustar-arte na página"; `ajustarArte` reajusta
 * a PÁGINA e conta com `invalidateScheduledRenders` — que alcança apenas posts
 * `RENDERED|PENDING|RENDERING`. Post nascido da bancada (arte gerada por IA) é
 * `NOT_NEEDED` e fica FORA desse alcance: para ele, ajustar a página não
 * trocava nada. E o PUT da interface aceita `mediaUrls` cru, sem guard de
 * situação e sem tocar `renderStatus` — porta larga demais para servir de
 * molde.
 *
 * O único precedente correto de escrever `mediaUrls` num post existente é o
 * runner da melhoria (`creative-improvement-runner.ts`), e é dele que vêm as
 * duas regras que este serviço carrega:
 *
 *  - **nunca reduzir a quantidade de mídias** (o carrossel apagado em silêncio);
 *  - **escrever com compare-and-swap**, para não ressuscitar uma lista velha
 *    por cima de quem editou no meio do caminho.
 *
 * As decisões que não precisam de banco — quem pode trocar, qual posição, e o
 * vínculo de render que o post passa a ter — moram em `troca-de-arte.ts`.
 */

import { db } from '@/lib/db'
import { CreativeError } from '@/lib/creatives/errors'
import { getPublicAppUrl, renderPageAndRegister } from '@/lib/creatives/persist'
import { ingerirMidiaExterna } from '@/lib/creatives/ingerir-midia'
import { AVISO_COPY_DE_ARTE_RE_RENDERIZADA, lerProcedencia } from '@/lib/creatives/procedencia-da-copy'
import { copyDeCamadas } from '@/lib/aprendizado/diff-copy'
import { registrarDecisaoSemSugestao } from '@/lib/aprendizado/captura'
import { chaveDeSugestao, resumoEstavel } from '@/lib/aprendizado/chaves'
import type { Superficie } from '@/lib/aprendizado/vocabulario'
import {
  decidirRender,
  descreverTroca,
  escolherIndice,
  montarNovasMidias,
  recusaDaTroca,
  textosDaGeneration,
  type OrigemDaArte,
  type RecusaDaTroca,
} from './troca-de-arte'
import { formatarBRT } from './agenda-acoes'
import { comoCopiaDaPagina } from './copy-segue-a-pagina'
import { PostLogEvent, Prisma } from '../../../prisma/generated/client'

/** Versão da regra, para a chave de idempotência do sinal de aprendizado. */
const VERSAO_DA_TROCA = 'troca-v1'

export interface TrocarArteDoPostInput {
  projectId: number
  postId: string
  /** Arte pronta da galeria. Exatamente UM entre este e `pageId`. */
  generationId?: string | null
  /** Página do editor, cujo render vira a arte. */
  pageId?: string | null
  /** Qual imagem trocar (0 = a primeira). Padrão 0. */
  indice?: number | null
  /** `User.id` INTERNO (cuid), NUNCA o clerkId. Auditoria do aprendizado. */
  decididoPor?: string | null
  /** Onde a decisão foi tomada. Padrão `chat`, de onde vem a maioria. */
  superficie?: Superficie
}

export interface TrocarArteDoPostResult {
  trocado: true
  postId: string
  /** Posição trocada (0 = a primeira imagem). */
  indice: number
  /** Quantas imagens o post tem AGORA — nunca menos do que tinha. */
  total: number
  /** A arte que entrou. */
  url: string
  imagens: string[]
  origem: OrigemDaArte
  /**
   * O post continua acompanhando edições futuras da página? Só é `true` para
   * post de imagem única cuja arte veio do render — ver `decidirRender`.
   */
  acompanhaAPagina: boolean
  generationId?: string
  pageId?: string
  quando?: string
  agendaUrl: string
  avisos?: string[]
  mensagem: string
}

function recusar(recusa: RecusaDaTroca): never {
  throw new CreativeError(recusa.codigo, recusa.mensagem, recusa.status)
}

export async function trocarArteDoPost(
  input: TrocarArteDoPostInput,
): Promise<TrocarArteDoPostResult> {
  const { projectId, postId } = input
  const generationId = input.generationId?.trim() || null
  const pageId = input.pageId?.trim() || null

  if (!!generationId === !!pageId) {
    throw new CreativeError(
      'ESCOLHA_UMA_ARTE',
      'Informe a arte da galeria (generationId) OU uma arte criada aqui (pageId) — uma das duas, não as duas.',
      400,
    )
  }

  const post = await db.socialPost.findUnique({
    where: { id: postId },
    select: {
      id: true,
      projectId: true,
      status: true,
      laterPostId: true,
      scheduledDatetime: true,
      mediaUrls: true,
      postType: true,
      pageId: true,
      generationId: true,
      campaignId: true,
    },
  })
  if (!post || post.projectId !== projectId) {
    throw new CreativeError('POST_NAO_ENCONTRADO', 'Post não encontrado neste projeto.', 404)
  }

  const recusa = recusaDaTroca(post)
  if (recusa) recusar(recusa)

  const midiasAtuais = post.mediaUrls ?? []
  const escolha = escolherIndice(midiasAtuais, input.indice)
  if (!escolha.ok) recusar(escolha.recusa!)
  const indice = escolha.indice ?? 0

  const avisos: string[] = []
  const origem: OrigemDaArte = generationId ? 'galeria' : 'pagina'

  /** A arte nova, o vínculo dela e os textos que ela carrega. */
  let url: string
  let novaGenerationId: string | null = null
  let novoTemplateId: number | null = null
  let novosTextos: Record<string, string> | null = null
  /** A copy da arte da galeria está invalidada (re-renderizada sem a copy visual regravada — R38): o post fica sem cópia. */
  let copyDaArteInvalidada = false

  if (generationId) {
    const gen = await db.generation.findFirst({
      where: { id: generationId, projectId },
      select: { id: true, resultUrl: true, fieldValues: true },
    })
    if (!gen) {
      throw new CreativeError(
        'CRIATIVO_NAO_ENCONTRADO',
        `Criativo não encontrado neste projeto: ${generationId}`,
        404,
      )
    }
    if (!gen.resultUrl) {
      throw new CreativeError(
        'CRIATIVO_SEM_IMAGEM',
        'Este criativo ainda não tem imagem pronta (geração em andamento ou falhada). Confira antes de trocar.',
        400,
      )
    }
    url = gen.resultUrl
    novaGenerationId = gen.id
    /**
     * A copy do post segue a PROCEDÊNCIA da arte, pela MESMA regra de
     * `agendarPost` (C6-03 da pré-revisão do HEAD f0eee811, 12/09/2026): arte
     * re-renderizada sem a copy visual regravada no mesmo re-render (marcador do
     * PR 0) carrega `slotValues` de OUTRA versão da mídia, e copiá-los fazia o
     * post afirmar um texto que o PNG não tem (R38). Com o marcador, a copy
     * regravada vale. Invalidada, o post fica SEM cópia textual e com o aviso de
     * `agendarPost` — nunca com a cópia da arte anterior, que o contrato
     * "null = não apaga" deixaria no lugar.
     */
    const procedencia = lerProcedencia(gen.fieldValues, null)
    copyDaArteInvalidada = procedencia.copyInvalidada
    if (copyDaArteInvalidada) avisos.push(AVISO_COPY_DE_ARTE_RE_RENDERIZADA)
    novosTextos = textosDaGeneration({ slotValues: procedencia.copyVisual })
  } else {
    const page = await db.page.findUnique({
      where: { id: pageId! },
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
    if (!page || page.Template.projectId !== projectId) {
      throw new CreativeError(
        'PAGE_NOT_FOUND',
        `Página não encontrada neste projeto: ${pageId}`,
        404,
      )
    }
    /**
     * Mesma recusa de `ajustarArte`: modelo é o layout reutilizável do cliente.
     * Pendurar um post nele deixaria a publicação refém de qualquer ajuste
     * futuro no tema — e o caminho certo (criar a arte a partir do modelo) já
     * existe.
     */
    if (page.isTemplate) {
      throw new CreativeError(
        'PAGINA_E_MODELO',
        'Esta página é um MODELO do cliente, não uma arte. Crie a arte a partir dele (criar-arte-de-modelo) e troque por ela.',
        400,
      )
    }

    const project = await db.project.findUnique({
      where: { id: projectId },
      select: { id: true, name: true, userId: true },
    })
    if (!project) {
      throw new CreativeError('PROJECT_NOT_FOUND', `Projeto não encontrado: ${projectId}`, 404)
    }

    /**
     * A página é RENDERIZADA agora, sempre — nunca se reaproveita
     * `Page.thumbnail`.
     *
     * O thumbnail só às vezes é o render: o PageSync o sobrescreve com um JPEG
     * base64 de 150px assim que alguém abre a página no editor (publicar isso
     * mandaria uma miniatura borrada, ou uma data URL que o Zernio nem aceita),
     * e a escrita de camadas por rota nem sempre o atualiza — ou seja, ele pode
     * ser um PNG do Blob perfeitamente utilizável e MESMO ASSIM estar velho.
     * Quem pede "põe a arte desta página no post" quer a página como ela está
     * agora, não como estava da última vez que alguém a renderizou.
     *
     * O render também devolve uma Generation, que é o que dá à arte trocada o
     * vínculo de "melhorar com IA" e o feedback de arte.
     */
    const renderizada = await renderPageAndRegister({
      project,
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
      authorName: 'troca-de-arte',
      fieldValues: {
        source: 'troca-de-arte',
        postId: post.id,
        // Alimenta a conferência por visão (extractExpectedTexts lê slotValues).
        slotValues: copyDeCamadas(page.layers) ?? undefined,
      },
    })

    url = renderizada.url
    novaGenerationId = renderizada.generationId
    novoTemplateId = page.templateId
    novosTextos = copyDeCamadas(page.layers)
  }

  /**
   * Mídia de fora vai para o Blob antes de entrar no post (idempotente para
   * host próprio, então na prática isto é no-op — as duas origens já são
   * nossas). Existe pelo mesmo motivo de `agendarPost`: post apontando para
   * CDN de terceiro perde a capa na agenda e trava o revert.
   */
  const ingestao = await ingerirMidiaExterna([url], projectId)
  url = ingestao.urls[0] ?? url
  if (ingestao.falhas.length > 0) {
    avisos.push(
      `Não deu para trazer a arte para o armazenamento do Studio (${ingestao.falhas[0].motivo}). ` +
        'O post ficou apontando para o link original, que pode sair do ar — vale conferir a arte na agenda.',
    )
  }

  const novasMidias = montarNovasMidias(midiasAtuais, indice, url)
  const decisao = decidirRender(origem, novasMidias.length)
  const agora = new Date()

  if (origem === 'pagina' && !decisao.vinculaPagina) {
    avisos.push(
      'Como este post é um carrossel, a arte entrou como imagem pronta: editar a página depois ' +
        'não vai atualizar o slide sozinho — troque de novo quando mexer nela.',
    )
  }

  /**
   * Vínculo com a Generation: só quando a troca é na PRIMEIRA imagem.
   *
   * `SocialPost.generationId` é "a arte deste post", e é por ele que a melhoria
   * com IA acha o que melhorar — melhoria que, sem índice, aplica o resultado
   * na posição 0. Apontá-lo para a arte do slide 3 faria "melhorar" pegar o
   * slide 3 e escrever o resultado por cima do slide 1.
   */
  const vinculaGeneration = indice === 0 && !!novaGenerationId

  /**
   * Os textos acompanham a arte. Vindos de uma PÁGINA eles são uma cópia do
   * texto dela e vão MARCADOS: o render desenha a página como ela estiver e a
   * cópia nunca volta para a arte (copy-segue-a-pagina.ts). Vindos da galeria
   * são a copy daquela arte, que não renderiza de página nenhuma.
   *
   * 🔴 **A cópia anterior só sobrevive quando a arte nova a SUSTENTA** (R55 da
   * revisão FINAL sobre d95de3e6, 20/09/2026). Pela GALERIA a mídia passa a ser
   * OUTRA arte, e o que estava gravado descreve a anterior: sem texto legível
   * na arte nova, a cópia é APAGADA, nunca preservada. O contrato antigo
   * ("`null` = não sei ler, então não apaga") valia para o ramo da PÁGINA, onde
   * a mídia continua saindo do render dela e `renderPostArt` mantém a cópia em
   * dia — ali ele fica, e só a troca de página apaga (slot velho em página nova
   * é pior que slot nenhum).
   *
   * Era esta preservação que produzia o estado que a LEITURA não tem como
   * desfazer: arte nova re-renderizada SEM `slotValues` (a peça do compositor
   * refeita) não dispara `copyInvalidada` — `lerProcedencia` exige
   * `slotValues !== null` —, e na agenda ela cai na exceção de R13 (arte
   * re-renderizada é a MESMA peça refeita), devolvendo a copy da arte ANTERIOR
   * como se fosse desta mídia. Do lado da leitura os dois estados são o MESMO;
   * quem pode não criá-lo é quem escreve.
   */
  const trocaDePagina = decisao.vinculaPagina && pageId !== post.pageId
  const slotValuesNovo = novosTextos
    ? { slotValues: (origem === 'pagina' ? comoCopiaDaPagina(novosTextos) : novosTextos) as Prisma.InputJsonValue }
    : copyDaArteInvalidada || trocaDePagina || origem === 'galeria'
      ? { slotValues: Prisma.DbNull }
      : {}

  const atualizado = await db.socialPost.updateMany({
    where: {
      id: post.id,
      projectId,
      // As duas travas de novo, agora como condição da escrita: entre a leitura
      // e este update o post pode ter sido aprovado ou entregue ao publicador.
      status: 'DRAFT',
      laterPostId: null,
      // Compare-and-swap: se outra edição mexeu nas mídias no meio do caminho,
      // esta escrita desiste em vez de ressuscitar a lista velha.
      mediaUrls: { equals: midiasAtuais },
    },
    data: {
      mediaUrls: novasMidias,
      renderStatus: decisao.renderStatus,
      renderError: null,
      ...(decisao.vinculaPagina
        ? {
            pageId,
            templateId: novoTemplateId,
            renderedImageUrl: url,
            renderedAt: agora,
            renderAttempts: 0,
            nextRenderAt: null,
          }
        : { nextRenderAt: null }),
      ...(vinculaGeneration ? { generationId: novaGenerationId } : {}),
      ...slotValuesNovo,
    },
  })

  if (atualizado.count === 0) {
    /**
     * Alguém mexeu no post entre a leitura e a escrita — aprovou, cancelou, ou
     * trocou a arte por outro caminho. Não se tenta de novo em laço: repetir
     * cegamente é como se sobrescreve o trabalho de outra pessoa.
     */
    throw new CreativeError(
      'POST_MUDOU_NO_MEIO',
      'Este post mudou enquanto a arte estava sendo trocada (alguém aprovou, cancelou ou trocou a arte). ' +
        'Confira a agenda e, se ainda quiser, peça a troca de novo.',
      409,
    )
  }

  // Histórico do post, como todo caminho que altera a agenda faz. Nunca
  // derruba a troca: a arte já está trocada quando isto roda.
  try {
    await db.postLog.create({
      data: {
        postId: post.id,
        event: PostLogEvent.EDITED,
        message:
          novasMidias.length > 1
            ? `Arte da imagem ${indice + 1}/${novasMidias.length} trocada (${decisao.motivo}).`
            : `Arte trocada (${decisao.motivo}).`,
        metadata: {
          de: midiasAtuais[indice] ?? null,
          para: url,
          indice,
          origem,
          generationId: novaGenerationId,
          pageId: decisao.vinculaPagina ? pageId : null,
          renderStatus: decisao.renderStatus,
          superficie: input.superficie ?? 'chat',
        },
      },
    })
  } catch (erro) {
    console.error('[trocar-arte] não deu para gravar o histórico do post:', erro)
  }

  /**
   * O SINAL: alguém olhou a arte que estava no post e pôs outra no lugar.
   *
   * É decisão SEM sugestão — o sistema não propôs "use esta arte aqui" —, o que
   * a mantém fora do denominador da taxa de aceitação sem filtro nenhum. A
   * chave é (post, posição, arte nova): repetir a mesma troca (retry do modelo,
   * duplo clique) não vira segundo sinal, mas trocar de novo por OUTRA arte
   * vira, porque é outra decisão.
   *
   * Falha aqui nunca derruba a troca — a arte já está no post.
   */
  try {
    await registrarDecisaoSemSugestao({
      projectId,
      tipo: 'troca-de-arte',
      escolhido: {
        de: midiasAtuais[indice] ?? null,
        para: url,
        indice,
        total: novasMidias.length,
        origem,
        motivo: decisao.motivo,
        postType: post.postType,
      },
      postId: post.id,
      generationId: novaGenerationId,
      pageId: decisao.vinculaPagina ? pageId : null,
      campaignId: post.campaignId,
      decididoPor: input.decididoPor ?? null,
      superficie: input.superficie ?? 'chat',
      chave: chaveDeSugestao(
        'troca-de-arte',
        VERSAO_DA_TROCA,
        projectId,
        `${post.id}#${indice}`,
        resumoEstavel(url),
      ),
    })
  } catch (erro) {
    console.error('[trocar-arte] falha ao registrar o sinal de aprendizado (seguindo sem ele):', erro)
  }

  const quandoBRT = post.scheduledDatetime ? formatarBRT(post.scheduledDatetime) : null

  return {
    trocado: true,
    postId: post.id,
    indice,
    total: novasMidias.length,
    url,
    imagens: novasMidias,
    origem,
    acompanhaAPagina: decisao.vinculaPagina,
    ...(novaGenerationId ? { generationId: novaGenerationId } : {}),
    ...(decisao.vinculaPagina && pageId ? { pageId } : {}),
    ...(quandoBRT ? { quando: quandoBRT } : {}),
    agendaUrl: `${getPublicAppUrl()}/projects/${projectId}/agenda`,
    ...(avisos.length > 0 ? { avisos } : {}),
    mensagem:
      `${descreverTroca(indice, novasMidias.length)}` +
      `${quandoBRT ? ` O rascunho segue na agenda para ${quandoBRT}` : ' O post segue como rascunho'}` +
      ' e não publica até ser aprovado.',
  }
}
