/**
 * Agendamento de posts a partir de uma arte já criada.
 *
 * O post nasce como DRAFT por padrão: colocar na fila de publicação é uma ação
 * que sai para o Instagram do cliente, então precisa ser pedida explicitamente
 * com status SCHEDULED.
 */

import { db } from '@/lib/db'
import { CreativeError } from '@/lib/creatives/errors'
import { getPublicAppUrl } from '@/lib/creatives/persist'
import { ingerirMidiaExterna } from '@/lib/creatives/ingerir-midia'
import {
  ESCOPO_PADRAO,
  escopoEmPortugues,
  type EscopoAprendizado,
  type OrigemDecisao,
} from '@/lib/posts/learning-scope'
import { copyDeCamadas, diffDeCopy } from '@/lib/aprendizado/diff-copy'
import {
  fecharSugestaoDeSlot,
  registrarCopyDoPost,
  registrarSlotDoPost,
} from '@/lib/aprendizado/sinal-de-agendamento'
import type { Superficie } from '@/lib/aprendizado/vocabulario'
import { PostType, PostStatus } from '@prisma/client'

/**
 * Aceita "YYYY-MM-DD HH:mm" em horário de Brasília (o jeito que a agenda é
 * pensada no dia a dia) ou um ISO com fuso explícito.
 */
export function parseBRT(input: string): Date {
  if (input.includes('T') && (input.endsWith('Z') || /[+-]\d{2}:\d{2}$/.test(input))) {
    return new Date(input)
  }
  const semFuso = /^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2})$/.exec(input)
  if (semFuso) {
    // BRT (UTC-3) → UTC
    return new Date(`${semFuso[1]}T${semFuso[2]}:00.000-03:00`)
  }
  const d = new Date(input)
  if (Number.isNaN(d.getTime())) {
    throw new CreativeError('DATA_INVALIDA', `Data não reconhecida: "${input}". Use "YYYY-MM-DD HH:mm" (BRT).`, 400)
  }
  return d
}

/**
 * Só os valores de texto de um `slotValues`, no formato do diff de copy.
 *
 * `_driveImageId`/`_imageUrl` são reservados e objetos aninhados carregam
 * `fileUrl` — nada disso é copy, e deixar entrar faria o diff acusar "campo
 * removido" toda vez que a foto mudasse.
 */
function apenasTextos(valores: Record<string, unknown> | null): Record<string, string> | null {
  if (!valores) return null
  const out: Record<string, string> = {}
  for (const [campo, valor] of Object.entries(valores)) {
    if (campo.startsWith('_')) continue
    const texto =
      typeof valor === 'string'
        ? valor
        : valor && typeof valor === 'object' && typeof (valor as any).content === 'string'
          ? ((valor as any).content as string)
          : null
    if (texto?.trim()) out[campo] = texto.trim()
  }
  return Object.keys(out).length > 0 ? out : null
}

/**
 * Copy proposta e modelo de origem, a partir da Generation que virou o post.
 *
 * ⚠️ `fieldValues.sourcePageId` é AMBÍGUO: em `source: 'ajuste-arte'` ele
 * aponta para a própria cópia ajustada, não para um modelo. A coluna
 * `Generation.sourcePageId` (espelho novo) não tem esse vício e por isso vem
 * primeiro; o Json só é consultado quando a coluna está vazia — o caso das
 * linhas anteriores a 11/08/2026 — e nunca para arte ajustada.
 */
function lerProcedencia(
  fieldValues: unknown,
  colunaSourcePageId: string | null,
): { copyProposta: Record<string, unknown> | null; sourcePageId: string | null } {
  const fv = (fieldValues ?? {}) as Record<string, unknown>
  const slotValues =
    fv.slotValues && typeof fv.slotValues === 'object' && !Array.isArray(fv.slotValues)
      ? (fv.slotValues as Record<string, unknown>)
      : null

  const doJson =
    fv.source !== 'ajuste-arte' && typeof fv.sourcePageId === 'string' ? fv.sourcePageId : null

  return { copyProposta: slotValues, sourcePageId: colunaSourcePageId ?? doJson }
}

export interface AgendarPostInput {
  projectId: number
  postType?: 'STORY' | 'POST' | 'REEL' | 'CAROUSEL'
  caption?: string
  /** "YYYY-MM-DD HH:mm" em BRT, ou ISO com fuso */
  scheduledDatetime: string
  /** Página da arte (de create-arte-livre / create-arte-rapida) */
  pageId?: string
  /** Imagens prontas, quando não vier de uma página */
  mediaUrls?: string[]
  /**
   * Generation que originou a arte (criar-arte devolve esse id). É o vínculo
   * que permite "Melhorar com IA" depois que o post for aprovado — sem ele a
   * rota de melhoria não tem o que melhorar.
   */
  generationId?: string
  /**
   * "rascunho" (padrão) só aparece na agenda; "agendado" entra na fila e
   * publica de verdade. O vocabulário é o da pessoa, não o do banco.
   */
  situacao?: 'rascunho' | 'agendado'
  /**
   * O que o sistema pode aprender com este post: ROTINA (padrão) sempre,
   * CAMPANHA com escopo temporal, PONTUAL nunca. Ver `learning-scope.ts` —
   * a captura é sempre; isto é o filtro da AGREGAÇÃO.
   */
  learningScope?: EscopoAprendizado
  /**
   * Entrada CAMPANHAS da base que dá o escopo temporal. Informar só o
   * `campaignId`, sem `learningScope`, já implica CAMPANHA.
   */
  campaignId?: string
  /** Como a decisão nasceu. Quem preenche de verdade é a fase de captura. */
  origem?: OrigemDecisao
  /** Sugestão que originou o post (entidade da F1). */
  sugestaoId?: string
  /** Quem decidiu — `User.id` INTERNO (cuid), NUNCA o clerkId. */
  decididoPor?: string
  /**
   * Onde a decisão foi tomada, para o registro de aprendizado. O padrão é
   * `chat` porque é de lá que vem a esmagadora maioria das chamadas; a agenda
   * web informa o seu.
   */
  superficie?: Superficie
}

export async function agendarPost(input: AgendarPostInput) {
  const project = await db.project.findUnique({
    where: { id: input.projectId },
    select: { id: true, name: true, userId: true, instagramAccountId: true },
  })
  if (!project) {
    throw new CreativeError('PROJECT_NOT_FOUND', `Projeto não encontrado: ${input.projectId}`, 404)
  }

  // generationId sozinho também serve: a mídia é resolvida do resultUrl da
  // Generation mais abaixo (caso da arte MELHORADA, que não tem página).
  if (!input.pageId && !input.mediaUrls?.length && !input.generationId) {
    throw new CreativeError(
      'SEM_MIDIA',
      'Informe pageId (arte criada aqui), generationId (arte da galeria/melhorada) ou mediaUrls — o post precisa de imagem.',
      400,
    )
  }

  let templateId: number | null = null
  let mediaUrls = input.mediaUrls ?? []
  /**
   * A arte deste post é um render da página (e não uma imagem que o chamador
   * trouxe pronta). É o que faz `invalidateScheduledRenders` reconhecer o post
   * quando a página muda: marcado NOT_NEEDED, ele ficaria com o PNG do momento
   * da criação para sempre — a agenda mostrando a arte velha e a publicação
   * saindo com ela.
   */
  let midiaVeioDaPagina = false
  /**
   * As camadas da página COMO ELA ESTÁ no momento do agendamento — o lado
   * FINAL do diff de copy, e a origem do `slotValues` que o post passa a
   * gravar. Cru de propósito: quem decodifica é `copyDeCamadas`, a única
   * leitura que distingue "página sem texto" de "não consegui ler".
   */
  let camadasDaPagina: unknown = null

  if (input.pageId) {
    const page = await db.page.findUnique({
      where: { id: input.pageId },
      select: {
        templateId: true,
        thumbnail: true,
        layers: true,
        Template: { select: { projectId: true } },
      },
    })
    if (!page) {
      throw new CreativeError('PAGE_NOT_FOUND', `Página não encontrada: ${input.pageId}`, 404)
    }
    if (page.Template.projectId !== input.projectId) {
      throw new CreativeError(
        'PAGE_DE_OUTRO_PROJETO',
        `A página ${input.pageId} pertence ao projeto ${page.Template.projectId}.`,
        400,
      )
    }
    templateId = page.templateId
    camadasDaPagina = page.layers
    // A arte já foi renderizada na criação; reusar o PNG evita re-render na fila.
    //
    // Só serve o thumbnail que veio do render (URL do Blob). Depois que alguém
    // abre a página no editor, o PageSync sobrescreve `thumbnail` com um JPEG
    // base64 de 150px — publicar isso mandaria uma miniatura borrada (ou uma
    // data URL que o Zernio nem aceita). Sem PNG utilizável, o post nasce sem
    // mídia e o cron renderiza a página atual.
    if (mediaUrls.length === 0 && page.thumbnail && !page.thumbnail.startsWith('data:')) {
      mediaUrls = [page.thumbnail]
      midiaVeioDaPagina = true
    }
  }

  /**
   * Vincular a Generation ao post é o que habilita "Melhorar com IA" na agenda.
   * Quando o chamador não informa (Claudinho antigo, mediaUrls prontos), tenta
   * derivar: a Generation criada por persistAndRenderCreative tem `resultUrl`
   * idêntico ao PNG que virou a mídia do post — o sufixo aleatório do Blob
   * torna o match inequívoco.
   */
  let generationId: string | null = null
  /**
   * A copy PROPOSTA na criação da arte e o modelo de onde ela saiu — o lado de
   * cima do diff. `fieldValues.slotValues` é o que o LLM escreveu; a página é
   * o que sobrou depois de todo mundo mexer.
   */
  let copyProposta: Record<string, unknown> | null = null
  let sourcePageId: string | null = null

  if (input.generationId) {
    const gen = await db.generation.findFirst({
      where: { id: input.generationId, projectId: project.id },
      select: { id: true, resultUrl: true, fieldValues: true, sourcePageId: true },
    })
    if (!gen) {
      throw new CreativeError(
        'GENERATION_NOT_FOUND',
        `Criativo não encontrado neste projeto: ${input.generationId}`,
        404,
      )
    }
    generationId = gen.id
    ;({ copyProposta, sourcePageId } = lerProcedencia(gen.fieldValues, gen.sourcePageId))
    // Sem mídia e sem página, o generationId basta: a arte é o resultUrl da
    // própria Generation — é o caso da arte MELHORADA (que não tem página) e
    // poupa o chat de copiar URL à mão, com os erros que isso traz.
    if (mediaUrls.length === 0 && !input.pageId) {
      if (!gen.resultUrl) {
        throw new CreativeError(
          'CRIATIVO_SEM_IMAGEM',
          'Este criativo ainda não tem imagem pronta (melhoria em andamento ou falhada). Confira com ver-melhoria antes de agendar.',
          400,
        )
      }
      mediaUrls = [gen.resultUrl]
    }
  } else if (mediaUrls.length > 0) {
    const gen = await db.generation.findFirst({
      where: { projectId: project.id, resultUrl: mediaUrls[0] },
      select: { id: true, fieldValues: true, sourcePageId: true },
      orderBy: { createdAt: 'desc' },
    })
    generationId = gen?.id ?? null
    if (gen) ({ copyProposta, sourcePageId } = lerProcedencia(gen.fieldValues, gen.sourcePageId))
  }

  /**
   * Só agora, depois do match por `resultUrl` acima — que precisa da URL como
   * ela veio — a mídia de fora é trazida para o Blob. Sem isso o post nasce
   * apontando para o CDN de quem gerou a arte: a agenda não consegue mostrar a
   * capa (host fora de `images.remotePatterns`), o revert fica bloqueado e a
   * publicação passa a depender de um link de terceiro sobreviver até a hora.
   */
  const avisos: string[] = []
  if (mediaUrls.length > 0) {
    const ingestao = await ingerirMidiaExterna(mediaUrls, project.id)
    mediaUrls = ingestao.urls
    if (ingestao.falhas.length > 0) {
      avisos.push(
        `Não deu para trazer ${ingestao.falhas.length} imagem(ns) para o armazenamento do Studio ` +
          `(${ingestao.falhas[0].motivo}). O post foi criado apontando para o link original, que pode ` +
          `sair do ar — vale conferir a arte na agenda.`,
      )
    }
  }

  /**
   * Escopo de aprendizado. `campaignId` sozinho já implica CAMPANHA: um id de
   * campanha com escopo de rotina seria contraditório, e no chat é fácil o
   * modelo informar um e esquecer o outro.
   */
  const learningScope: EscopoAprendizado =
    input.learningScope ?? (input.campaignId ? 'CAMPANHA' : ESCOPO_PADRAO)

  /**
   * Campanha que não existe neste projeto vira AVISO, não erro: o ponteiro é
   * frouxo (sem FK) e recusar o agendamento por causa de um metadado seria
   * pior do que gravar um vínculo torto e visível.
   */
  if (input.campaignId) {
    const campanha = await db.knowledgeBaseEntry.findFirst({
      where: { id: input.campaignId, projectId: project.id },
      select: { id: true, category: true },
    })
    if (!campanha) {
      avisos.push(
        `Não achei a campanha ${input.campaignId} na base deste cliente — o post foi marcado como ` +
          `campanha assim mesmo, mas confira o vínculo.`,
      )
    } else if (campanha.category !== 'CAMPANHAS') {
      avisos.push(
        `A entrada ${input.campaignId} da base não é de CAMPANHAS — o vínculo foi gravado, mas ` +
          `o escopo temporal só funciona com entrada de campanha.`,
      )
    }
  }

  const vaiPublicar = input.situacao === 'agendado'
  const status = (vaiPublicar ? 'SCHEDULED' : 'DRAFT') as PostStatus
  const quando = parseBRT(input.scheduledDatetime)

  const formatarBRT = (d: Date) =>
    d.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' })

  if (vaiPublicar && quando.getTime() < Date.now()) {
    throw new CreativeError(
      'DATA_NO_PASSADO',
      `Esse horário já passou (${formatarBRT(quando)}). Escolha uma data à frente.`,
      400,
    )
  }
  if (vaiPublicar && !project.instagramAccountId) {
    throw new CreativeError(
      'SEM_CONTA_INSTAGRAM',
      `O projeto "${project.name}" ainda não tem conta do Instagram conectada, então não dá para publicar. Dá para deixar como rascunho na agenda.`,
      400,
    )
  }

  /**
   * A copy que está indo para a agenda.
   *
   * Lado FINAL: a página como está agora — é ela que o cron re-renderiza e é
   * ela que vai ao ar. Sem página (arte melhorada, mídia pronta), o que a
   * Generation registrou é o melhor que existe.
   *
   * `copyDeCamadas` devolve `null` em página ILEGÍVEL, e isso não vira `{}`:
   * copy desconhecida tem de ficar desconhecida, senão o post entra no corpus
   * como "sem texto nenhum".
   */
  const copyDaPagina = copyDeCamadas(camadasDaPagina)
  const copyPropostaTexto = apenasTextos(copyProposta)
  const copyFinal = copyDaPagina ?? copyPropostaTexto

  /**
   * O diff que interessa: o que a IA propôs na criação × o que de fato está na
   * arte na hora de agendar. Só existe com os dois lados — e a página tem de
   * ser legível, senão o diff diria "não mudou nada" justamente onde não se
   * sabe nada.
   */
  const diffDaCopy =
    copyPropostaTexto && copyDaPagina ? diffDeCopy(copyPropostaTexto, copyDaPagina) : null

  const post = await db.socialPost.create({
    data: {
      projectId: project.id,
      userId: project.userId,
      postType: (input.postType ?? 'STORY') as PostType,
      caption: input.caption ?? '',
      mediaUrls,
      scheduleType: 'SCHEDULED',
      scheduledDatetime: quando,
      status,
      pageId: input.pageId ?? null,
      templateId,
      generationId,
      renderStatus: (mediaUrls.length === 0
        ? 'PENDING'
        : midiaVeioDaPagina
          ? 'RENDERED'
          : 'NOT_NEEDED') as never,
      ...(midiaVeioDaPagina ? { renderedImageUrl: mediaUrls[0], renderedAt: new Date() } : {}),
      // Sem arte pronta o cron precisa renderizar — sem isso o post fica
      // PENDING com nextRenderAt null e nunca entra na fila de render.
      ...(mediaUrls.length === 0 ? { nextRenderAt: new Date() } : {}),
      learningScope,
      campaignId: input.campaignId ?? null,
      origem: input.origem ?? null,
      sugestaoId: input.sugestaoId ?? null,
      decididoPor: input.decididoPor ?? null,
      // A coluna existe desde sempre e só o `later-scheduler` a preenchia — o
      // post que nasce do chat ficava sem registro nenhum do texto que carrega.
      ...(copyFinal ? { slotValues: copyFinal } : {}),
    },
    select: {
      id: true,
      status: true,
      postType: true,
      scheduledDatetime: true,
      mediaUrls: true,
      learningScope: true,
    },
  })

  /**
   * Sinais do agendamento. Depois do create, de propósito: a chave de
   * idempotência é o id do post, e registrar antes deixaria linha órfã se a
   * criação falhasse. Nenhuma destas chamadas lança — captura que quebra o
   * agendamento é o defeito que `captura.ts` foi escrito para impedir.
   */
  const superficie = input.superficie ?? 'chat'
  /**
   * Uma linha por slot, nunca duas. Com proposta, quem registra é
   * `fecharSugestaoDeSlot` (logo abaixo), que já grava o proposto E o
   * comprometido; sem proposta, é escolha absoluta e entra por aqui.
   */
  if (!input.sugestaoId) {
    await registrarSlotDoPost({
      projectId: project.id,
      postId: post.id,
      quando,
      postType: post.postType,
      situacao: vaiPublicar ? 'agendado' : 'rascunho',
      pageId: input.pageId ?? null,
      generationId,
      campaignId: input.campaignId ?? null,
      sourcePageId,
      decididoPor: input.decididoPor ?? null,
      superficie,
    })
  }
  await registrarCopyDoPost({
    projectId: project.id,
    postId: post.id,
    copyFinal,
    diff: diffDaCopy,
    pageId: input.pageId ?? null,
    generationId,
    campaignId: input.campaignId ?? null,
    decididoPor: input.decididoPor ?? null,
    superficie,
  })
  if (input.sugestaoId) {
    await fecharSugestaoDeSlot({
      sugestaoId: input.sugestaoId,
      postId: post.id,
      quando,
      // O horário virou post: a proposta foi aceita. Se alguém a moveu antes
      // de agendar, quem corrige o desfecho é o reagendamento — a janela vai
      // até a publicação e evidência mais forte sobrescreve.
      desfecho: input.origem === 'sugerido-editado' ? 'editada' : 'aceita-como-veio',
      contexto: {
        postType: post.postType,
        situacao: vaiPublicar ? 'agendado' : 'rascunho',
        sourcePageId,
      },
      pageId: input.pageId ?? null,
      generationId,
      campaignId: input.campaignId ?? null,
      decididoPor: input.decididoPor ?? null,
      superficie,
    })
  }

  const quandoBRT = formatarBRT(post.scheduledDatetime!)
  const tipo = post.postType === 'STORY' ? 'story' : post.postType.toLowerCase()

  return {
    postId: post.id,
    situacao: vaiPublicar ? 'agendado' : 'rascunho',
    tipo,
    quando: quandoBRT,
    imagens: post.mediaUrls,
    // Só quando sai do padrão: repetir "rotina" em toda resposta vira ruído
    // que o modelo acaba narrando na conversa.
    ...(post.learningScope !== ESCOPO_PADRAO
      ? { escopo: escopoEmPortugues(post.learningScope as EscopoAprendizado) }
      : {}),
    ...(avisos.length > 0 ? { aviso: avisos.join(' ') } : {}),
    agendaUrl: `${getPublicAppUrl()}/projects/${project.id}/agenda`,
    // Frase pronta para o modelo repetir: evita que ele traduza "DRAFT" sozinho
    mensagem: vaiPublicar
      ? `Agendado: este ${tipo} vai ser publicado no Instagram de ${project.name} em ${quandoBRT}.`
      : `Deixei como rascunho na agenda de ${project.name}, para ${quandoBRT}. Rascunho não publica — é só avisar quando quiser que eu agende de verdade.`,
  }
}

/**
 * "Postar agora": agenda como AGENDADO para daqui a poucos minutos — o
 * executor manda à fila de publicação em ~1min e o post sai no horário. Os 3
 * minutos são a folga para o PRE-SEND não esbarrar no guard de horário
 * passado e para a pessoa ainda conseguir cancelar um engano.
 *
 * Publica DE VERDADE: quem chama é responsável pelo gate de confirmação
 * explícita (mesma regra do aprovar-rascunhos).
 */
export async function postarAgora(
  input: Omit<AgendarPostInput, 'scheduledDatetime' | 'situacao'>,
) {
  const quando = new Date(Date.now() + 3 * 60_000)
  const brt = new Date(quando.getTime() - 3 * 3600_000)
  const pad = (n: number) => String(n).padStart(2, '0')
  const scheduledDatetime = `${brt.getUTCFullYear()}-${pad(brt.getUTCMonth() + 1)}-${pad(brt.getUTCDate())} ${pad(brt.getUTCHours())}:${pad(brt.getUTCMinutes())}`

  const resultado = await agendarPost({ ...input, scheduledDatetime, situacao: 'agendado' })
  return {
    ...resultado,
    mensagem: `No ar em instantes: este ${resultado.tipo} entra na fila agora e publica ~${resultado.quando} no Instagram do cliente. Para desfazer, cancele nos próximos 2 minutos.`,
  }
}
