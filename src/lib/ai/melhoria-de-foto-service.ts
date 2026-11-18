/**
 * Início e aplicação da MELHORIA DE FOTO (17/11/2026,
 * `docs/PLANO-2026-11-17-MELHORAR-FOTO-COM-IA.md`).
 *
 * `startMelhoriaDeFoto` valida o pedido, decide o caminho (pela página, ou a
 * reserva na arte chapada) e cria o job. Como `startImprovement`, não dispara
 * o trabalho pesado: devolve os argumentos do runner e quem chamou enfileira.
 *
 * `aplicarOpcaoDeFoto` é o passo que muda a página: só roda quando alguém
 * escolheu a opção. Nada é aplicado sozinho.
 *
 * Tudo atrás de `MELHORIA_DE_FOTO`. Não valida saldo nem cobra crédito.
 */

import type { CanalDaArte } from '@/lib/creatives/canal'
import { CreativeError } from '@/lib/creatives/errors'
import { mesclarFieldValuesDaArte } from '@/lib/creatives/mesclar-field-values'
import { versaoDaPagina } from '@/lib/creatives/revisao/versao'
import { db } from '@/lib/db'
import { aplicarArteMelhoradaAoPost } from '@/lib/posts/aplicar-arte-melhorada'
import { recusaDeArteNoZernio } from '@/lib/posts/midia-no-zernio'
import { FINAL_OUTPUT_SIZE, inferFormatFromTemplate, OPENAI_INPUT_SIZE } from './creative-improvement-format'
import type { ImprovementJobArgs } from './creative-improvement-runner'
import { startImprovement } from './creative-improvement-service'
import { registrarFotoMelhoradaNoAcervo } from './foto-melhorada-no-acervo'
import { idDoModeloGemini } from './gemini-image-client'
import { FONTE_DA_MELHORIA_DE_FOTO, fotoAindaEAMesma, lerRegistroDaMelhoriaDeFoto, opcaoParaAplicar, type RegistroDaMelhoriaDeFoto } from './melhoria-de-foto-registro'
import { MODELO_DA_FOTO } from './melhoria-de-foto-runner'
import { acharFotoDaPagina, pageIdDaArte, RECORTE_INTEIRO, rotaDaMelhoriaDeFoto, type MotivoDaReserva } from './quadro-da-foto'
import { melhoriaDeFotoLigada, normalizarReceitas, TETO_DO_PROMPT_DE_FOTO } from './receitas-de-foto'

/** Por que a arte foi pela reserva, em português de quem lê. */
export const MOTIVO_DA_RESERVA: Record<MotivoDaReserva, string> = {
  'sem-pagina': 'esta arte não tem página no editor (arte importada, de canvas ou trazida do Zernio)',
  'pagina-modelo': 'a página desta arte é um modelo, e a foto de um modelo não é trocada por aqui',
  'ja-e-melhoria': 'esta arte já é uma melhoria com IA (imagem chapada): a foto por baixo não alcança o que ela mostra',
  'sem-foto-na-pagina': 'a página desta arte não tem camada de foto',
}

export interface StartMelhoriaDeFotoInput {
  projectId: number
  /** A arte cuja foto vai ser melhorada. */
  generationId: string
  /** As receitas como vieram do pedido (`normalizarReceitas` confere). */
  receitas?: unknown
  pedido?: string
  /** O prompt detalhado, escrito por quem olhou a arte (o chat). Até 4.000 caracteres. */
  promptPronto?: string | null
  /** 1 (padrão) ou 2. */
  opcoes?: number
  /** O post que vai receber a arte QUANDO a opção for aplicada. Nada muda nele antes disso. */
  postId?: string | null
  /** Quem assina a Generation: id do CLERK. */
  actorClerkId: string
  canal?: CanalDaArte | null
  dedupeWindowMinutes?: number
}

export interface StartMelhoriaDeFotoResult {
  jobGenerationId: string
  reused: boolean
  runnerArgs: ImprovementJobArgs | null
  via: 'pagina' | 'reserva'
  motivoDaReserva?: MotivoDaReserva
  avisos: string[]
}

export async function startMelhoriaDeFoto(input: StartMelhoriaDeFotoInput): Promise<StartMelhoriaDeFotoResult> {
  if (!melhoriaDeFotoLigada()) {
    throw new CreativeError('MELHORIA_DE_FOTO_DESLIGADA', 'A melhoria de foto ainda não está ligada neste ambiente (MELHORIA_DE_FOTO). Use a melhoria da arte (alvo "arte").', 400)
  }
  const { receitas, erros } = normalizarReceitas(input.receitas)
  if (erros.length > 0) throw new CreativeError('RECEITAS_INVALIDAS', `Receitas inválidas: ${erros.join('; ')}.`, 400, { erros })
  const pedido = (input.pedido ?? '').trim()
  const promptPronto = input.promptPronto?.trim() || null
  if (pedido.length > 1200) throw new CreativeError('PEDIDO_LONGO', 'O pedido de melhoria passou de 1200 caracteres.', 400)
  if (promptPronto && promptPronto.length > TETO_DO_PROMPT_DE_FOTO) {
    throw new CreativeError('PROMPT_LONGO', `O prompt pronto tem ${promptPronto.length} caracteres e o teto é ${TETO_DO_PROMPT_DE_FOTO}.`, 400)
  }
  if (receitas.length === 0 && !promptPronto && !pedido) {
    throw new CreativeError('PEDIDO_OBRIGATORIO', 'Para melhorar a foto, escolha uma receita, escreva o pedido ou mande o prompt pronto.', 400)
  }
  const opcoes = input.opcoes ?? 1
  if (opcoes !== 1 && opcoes !== 2) throw new CreativeError('ENTRADA_INVALIDA', 'opcoes aceita 1 ou 2.', 400)

  const original = await db.generation.findFirst({
    where: { id: input.generationId, projectId: input.projectId },
    select: { id: true, projectId: true, templateId: true, resultUrl: true, templateName: true, fieldValues: true, Template: { select: { type: true, dimensions: true } } },
  })
  if (!original) throw new CreativeError('GENERATION_NOT_FOUND', 'Criativo não encontrado', 404)
  if (!original.resultUrl) throw new CreativeError('SEM_IMAGEM', 'Criativo sem imagem disponível', 400)

  /**
   * O post entra aqui só para recusar ANTES de gastar (post saindo, janela de
   * publicação) e para saber se o que ele mostra é uma melhoria chapada. A
   * arte dele só muda ao aplicar a opção.
   */
  let origem: { id: string; fieldValues: unknown } = original
  if (input.postId) {
    const post = await db.socialPost.findFirst({
      where: { id: input.postId, projectId: input.projectId },
      select: { status: true, laterPostId: true, lateStatus: true, scheduledDatetime: true, generationId: true },
    })
    if (!post) throw new CreativeError('POST_NAO_ENCONTRADO', 'Post não encontrado neste projeto', 404)
    if (post.status !== 'SCHEDULED' && post.status !== 'DRAFT') {
      throw new CreativeError('POST_NAO_MELHORAVEL', `Este post não pode ser melhorado (status ${post.status}).`, 400)
    }
    if (post.laterPostId) {
      const recusa = recusaDeArteNoZernio(post)
      if (recusa) throw new CreativeError(recusa.codigo, recusa.mensagem, recusa.status)
    }
    if (post.generationId && post.generationId !== original.id) {
      const noPost = await db.generation.findFirst({ where: { id: post.generationId, projectId: input.projectId }, select: { id: true, fieldValues: true, resultUrl: true } })
      const fv = (noPost?.fieldValues ?? {}) as Record<string, unknown>
      if (noPost?.resultUrl && fv.source === 'ai_improvement') origem = noPost
    }
  }

  const pageId = pageIdDaArte(original.fieldValues)
  const pagina = pageId
    ? await db.page.findFirst({ where: { id: pageId, Template: { projectId: input.projectId } }, select: { id: true, isTemplate: true, layers: true } })
    : null
  const rota = rotaDaMelhoriaDeFoto(origem, pagina)

  if (rota.via === 'reserva') {
    const avisos = [`Foi pela reserva (a IA mexe na arte pronta, não só na foto) porque ${MOTIVO_DA_RESERVA[rota.motivo]}. O texto pode sair diferente: confira.`]
    if (opcoes === 2) avisos.push('Na reserva sai uma opção por pedido; para comparar, peça de novo.')
    if (rota.motivo === 'ja-e-melhoria') avisos.push('Para melhorar só a foto, volte o post para a versão do editor (reverter-arte) e peça a melhoria de foto sobre ela.')
    const iniciada = await startImprovement({
      generationId: origem.id,
      userRequest: pedido,
      // Os modos governam o diretor de ARTE, que na reserva não escreve o prompt; `rediagramar` não exige pedido.
      modo: 'rediagramar',
      gerador: 'gemini',
      fotoPelaReserva: { receitas, promptPronto, motivo: rota.motivo },
      semCobranca: true,
      actorClerkId: input.actorClerkId,
      canal: input.canal,
      dedupeWindowMinutes: input.dedupeWindowMinutes,
    })
    return { ...iniciada, via: 'reserva', motivoDaReserva: rota.motivo, avisos }
  }

  if (input.dedupeWindowMinutes && input.dedupeWindowMinutes > 0) {
    const emAndamento = await db.generation.findFirst({
      where: { sourceGenerationId: original.id, status: 'PROCESSING', createdAt: { gte: new Date(Date.now() - input.dedupeWindowMinutes * 60_000) } },
      orderBy: { createdAt: 'desc' },
      select: { id: true },
    })
    if (emAndamento) return { jobGenerationId: emAndamento.id, reused: true, runnerArgs: null, via: 'pagina', avisos: [] }
  }

  const projeto = await db.project.findUnique({ where: { id: original.projectId }, select: { name: true, googleDriveFolderId: true } })
  if (!projeto) throw new CreativeError('PROJECT_NOT_FOUND', 'Projeto não encontrado', 404)
  const format = inferFormatFromTemplate(original.Template)
  const tamanho = FINAL_OUTPUT_SIZE[format]

  // A Generation da PROPOSTA: nasce PROCESSING, e quem pediu acompanha por ela.
  const job = await db.generation.create({
    data: {
      templateId: original.templateId,
      projectId: original.projectId,
      status: 'PROCESSING',
      resultUrl: null,
      fileName: null,
      sourceGenerationId: original.id,
      fieldValues: {
        source: FONTE_DA_MELHORIA_DE_FOTO,
        alvo: 'foto',
        originalGenerationId: original.id,
        userRequest: pedido,
        receitas: receitas as never,
        opcoesPedidas: opcoes,
        postId: input.postId ?? null,
        model: idDoModeloGemini(MODELO_DA_FOTO),
        format,
        finalSize: `${tamanho.width}x${tamanho.height}`,
        processingStartedAt: new Date().toISOString(),
      },
      templateName: `${original.templateName ?? 'Criativo'} (opção de foto)`,
      projectName: projeto.name,
      createdBy: input.actorClerkId,
      canal: input.canal ?? null,
    },
  })

  return {
    jobGenerationId: job.id,
    reused: false,
    via: 'pagina',
    avisos: [],
    runnerArgs: {
      jobGenerationId: job.id,
      originalGenerationId: original.id,
      originalResultUrl: original.resultUrl,
      // A arte do post só muda ao aplicar: o runner não recebe post nenhum.
      applyToPostId: null,
      userId: input.actorClerkId,
      canal: input.canal ?? null,
      projectId: original.projectId,
      projectName: projeto.name,
      projectGoogleDriveFolderId: projeto.googleDriveFolderId ?? null,
      templateName: original.templateName,
      userRequest: pedido,
      backgroundImageUrl: null,
      selectedLogoIds: [],
      selectedElementIds: [],
      format,
      foto: { pageId: rota.foto ? pagina!.id : '', receitas, pedido, promptPronto, opcoes, postId: input.postId ?? null },
    },
  }
}

export interface AplicarOpcaoDeFotoInput {
  projectId: number
  /** A Generation da proposta (o `melhoriaId` que `melhorar-arte` devolveu). */
  melhoriaId: string
  /** 1 ou 2. */
  opcao: number
  /** O post que recebe a arte. Sem ele, vale o do pedido. */
  postId?: string | null
  /** Quem decidiu: `User.id` INTERNO. Auditoria. */
  decididoPor?: string | null
  canal?: CanalDaArte | null
  appUrl: string
}

export interface AplicarOpcaoDeFotoResult {
  aplicada: true
  jaEstavaAplicada?: boolean
  via: 'pagina' | 'reserva'
  /** A arte que passou a valer: a renderizada da página, ou a da reserva. */
  generationId: string
  url: string
  pageId?: string
  editUrl?: string
  postsInvalidados?: number
  postsCongelados?: number
  /** Post que já estava no Zernio: a arte foi trocada lá? */
  postNoZernio?: { aplicada: boolean; motivo?: string }
  avisos: string[]
}

/** O post que vai receber a arte, conferido ANTES de qualquer escrita. */
async function conferirPost(projectId: number, postId: string) {
  const post = await db.socialPost.findFirst({
    where: { id: postId, projectId },
    select: { id: true, status: true, laterPostId: true, lateStatus: true, scheduledDatetime: true },
  })
  if (!post) throw new CreativeError('POST_NAO_ENCONTRADO', 'Post não encontrado neste projeto', 404)
  if (post.status !== 'SCHEDULED' && post.status !== 'DRAFT') {
    throw new CreativeError('POST_NAO_MELHORAVEL', `Este post não pode receber a arte (status ${post.status}).`, 400)
  }
  // `laterPostId` não nulo: o post já está no Zernio. Dentro da janela de publicação, recusar sem tocar em nada.
  if (post.laterPostId) {
    const recusa = recusaDeArteNoZernio(post)
    if (recusa) throw new CreativeError(recusa.codigo, recusa.mensagem, recusa.status)
  }
  return post
}

export async function aplicarOpcaoDeFoto(input: AplicarOpcaoDeFotoInput): Promise<AplicarOpcaoDeFotoResult> {
  const gen = await db.generation.findFirst({
    where: { id: input.melhoriaId, projectId: input.projectId },
    select: { id: true, status: true, resultUrl: true, fieldValues: true },
  })
  if (!gen) throw new CreativeError('MELHORIA_NAO_ENCONTRADA', 'Melhoria não encontrada neste cliente.', 404)
  if (gen.status !== 'COMPLETED') throw new CreativeError('MELHORIA_NAO_PRONTA', 'Esta melhoria ainda não ficou pronta (ou falhou): confira com ver-geracao.', 409)
  const fv = (gen.fieldValues ?? {}) as Record<string, unknown>

  // RESERVA: a "opção" é a própria arte melhorada. Aplicar é pôr no post, pelo caminho que a melhoria já usa.
  if (fv.source === 'ai_improvement' && fv.fotoPelaReserva) {
    if (input.opcao !== 1) throw new CreativeError('OPCAO_NAO_EXISTE', 'Na reserva a melhoria tem uma opção só (a 1).', 404)
    if (!gen.resultUrl) throw new CreativeError('SEM_IMAGEM', 'Esta melhoria não tem imagem.', 400)
    if (!input.postId) {
      return { aplicada: true, via: 'reserva', generationId: gen.id, url: gen.resultUrl, avisos: ['Esta melhoria foi pela reserva: a arte nova já está na galeria. Para pôr num post, informe o postId (ou use colocar-na-agenda com este generationId).'] }
    }
    await conferirPost(input.projectId, input.postId)
    const noPost = await aplicarArteMelhoradaAoPost({ postId: input.postId, projectId: input.projectId, url: gen.resultUrl, generationId: gen.id })
    if (!noPost.aplicada) throw new CreativeError('POST_NAO_ATUALIZADO', `A arte não entrou no post: ${noPost.motivo ?? 'motivo desconhecido'}. Ela continua na galeria.`, 409)
    return { aplicada: true, via: 'reserva', generationId: gen.id, url: gen.resultUrl, avisos: [] }
  }

  const registro = lerRegistroDaMelhoriaDeFoto(fv)
  if (!registro) throw new CreativeError('NAO_E_MELHORIA_DE_FOTO', 'Esta geração não é uma melhoria de foto com opções para aplicar.', 400)
  const editUrlDe = (templateId: number) => `${input.appUrl}/templates/${templateId}/editor?pageId=${encodeURIComponent(registro.pageId)}`
  const escolha = opcaoParaAplicar(registro, input.opcao)

  const pagina = await db.page.findFirst({
    where: { id: registro.pageId, Template: { projectId: input.projectId } },
    select: { id: true, isTemplate: true, width: true, height: true, background: true, layers: true, templateId: true },
  })
  if (!pagina) throw new CreativeError('PAGE_NOT_FOUND', 'A página desta arte não existe mais neste cliente.', 404)

  // Aplicar de novo a mesma opção devolve o que já foi feito: nenhum outro ajuste, nenhuma outra Generation.
  if (escolha.ok === 'ja-aplicada') {
    return { aplicada: true, jaEstavaAplicada: true, via: 'pagina', generationId: escolha.aplicada.generationId, url: escolha.aplicada.url, pageId: pagina.id, editUrl: editUrlDe(pagina.templateId), avisos: [] }
  }
  if (escolha.ok === false) throw new CreativeError(escolha.codigo, escolha.mensagem, escolha.codigo === 'OPCAO_NAO_EXISTE' ? 404 : 409)
  const opcao = escolha.opcao

  const postId = input.postId ?? registro.postId
  const post = postId ? await conferirPost(input.projectId, postId) : null

  if (pagina.isTemplate) throw new CreativeError('PAGINA_VIROU_MODELO', 'A página desta arte virou modelo: a foto de um modelo não é trocada por aqui.', 409)
  if (!fotoAindaEAMesma(registro, acharFotoDaPagina(pagina.layers))) {
    throw new CreativeError(
      'FOTO_DA_PAGINA_MUDOU',
      'A foto da página mudou desde que esta opção foi gerada (outra foto, outro recorte ou outro tamanho). Peça uma melhoria nova sobre a arte atual.',
      409,
    )
  }

  /**
   * A troca passa pela porta de `ajustarArte` (mesmo render, mesma
   * invalidação da agenda e a recomposição da arte congelada), pela operação
   * de camadas: `imageUrl` não zera o recorte nem garante a mesma camada, e a
   * foto nova já vem no quadro, então entra com o recorte inteiro.
   */
  const { ajustarArte } = await import('@/lib/creatives/arte-rapida')
  const ajuste = await ajustarArte({
    projectId: input.projectId,
    pageId: pagina.id,
    versaoEsperada: versaoDaPagina(pagina),
    camadas: [{ op: 'definir', camada: registro.camadaId, campos: { fileUrl: opcao.fotoUrl!, style: { crop: { ...RECORTE_INTEIRO } } } }],
    decididoPor: input.decididoPor ?? null,
    canal: input.canal ?? null,
  })

  const avisos = [...(ajuste.avisos ?? [])]
  // Post que já está no Zernio: o render da agenda não o alcança, então a arte renderizada troca LÁ.
  let postNoZernio: AplicarOpcaoDeFotoResult['postNoZernio']
  if (post?.laterPostId) {
    const noPost = await aplicarArteMelhoradaAoPost({ postId: post.id, projectId: input.projectId, url: ajuste.url, generationId: ajuste.generationId })
    postNoZernio = noPost.aplicada ? { aplicada: true } : { aplicada: false, motivo: noPost.motivo }
    if (!noPost.aplicada) avisos.push(`A página foi atualizada, mas a arte não entrou no post que já está no Zernio: ${noPost.motivo ?? 'motivo desconhecido'}.`)
  }

  const aplicada: NonNullable<RegistroDaMelhoriaDeFoto['aplicada']> = { opcao: opcao.opcao, generationId: ajuste.generationId, url: ajuste.url, em: new Date().toISOString(), postId: post?.id ?? null }
  // Merge NO BANCO: a Generation da proposta já existe, e outra escrita pode ter passado por ela.
  await mesclarFieldValuesDaArte(db, gen.id, { melhoriaDeFoto: { ...registro, aplicada } })

  // O gancho da próxima fatia (a foto usada entra no acervo). Hoje sem efeito.
  await registrarFotoMelhoradaNoAcervo({
    projectId: input.projectId,
    fotoUrl: opcao.fotoUrl!,
    fotoDeOrigemUrl: registro.fotoDeOrigemUrl,
    receitas: registro.receitas.map((r) => r.id),
    generationId: ajuste.generationId,
  }).catch((erro) => console.warn('[foto] gancho do acervo falhou:', erro))

  return {
    aplicada: true,
    via: 'pagina',
    generationId: ajuste.generationId,
    url: ajuste.url,
    pageId: pagina.id,
    editUrl: ajuste.editUrl,
    postsInvalidados: ajuste.postsInvalidados,
    ...(ajuste.postsCongelados ? { postsCongelados: ajuste.postsCongelados } : {}),
    ...(postNoZernio ? { postNoZernio } : {}),
    avisos,
  }
}
