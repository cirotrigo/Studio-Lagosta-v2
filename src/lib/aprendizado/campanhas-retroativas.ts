/**
 * Campanhas descobertas no histórico: listar candidatas e confirmar com um
 * clique, gravando `campaignId` RETROATIVO (F2).
 *
 * A confirmação faz duas coisas de uma vez:
 *
 *  1. dá ao Ciro o inventário de campanhas passadas que nunca foi registrado
 *     em lugar nenhum;
 *  2. **descontamina a cadência inicial** — post de campanha deixa de ensinar
 *     rotina no mesmo instante (ver `cadencia.ts`, regra "confirma, nunca
 *     cria").
 *
 * ── ONDE A CAMPANHA MORA ──────────────────────────────────────────────────
 * `SocialPost.campaignId` aponta para uma entrada CAMPANHAS da base de
 * conhecimento — é o contrato que a F0.1 estabeleceu e que
 * `campanha-vigencia.ts` já lê. Confirmar uma campanha do passado, portanto,
 * ou LIGA os posts a uma entrada que já existe (o caso do Festival Italiano do
 * Wine Vix, que está na base) ou CRIA uma entrada de registro.
 *
 * ⚠️ A entrada criada aqui nasce **ARCHIVED e sem indexação**, e não passa por
 * `criarEntradaBase` de propósito: aquele serviço grava ACTIVE e indexa para a
 * busca, que é o certo para conhecimento vivo e o errado para o registro de uma
 * campanha que já acabou. Uma campanha encerrada indexada voltaria a alimentar
 * copy — exatamente o defeito que a F0.1 veio corrigir.
 */

import { db } from '@/lib/db'
import { detectarCampanhas, type CampanhaCandidata, type PostClassificado } from './bursts'
import { textoDoPost } from './textos-do-post'

/** Janela padrão de varredura do histórico. */
const JANELA_PADRAO_DIAS = 180

export interface CampanhaJaNaBase {
  id: string
  titulo: string
  status: string
  expiraEm: Date | null
  /** Quantos posts já apontam para ela. */
  postsLigados: number
}

export interface InventarioDeCampanhas {
  candidatas: CampanhaCandidata[]
  /** Entradas CAMPANHAS que já existem — a candidata pode ser ligada a uma delas. */
  naBase: CampanhaJaNaBase[]
  /** Quantos posts do período têm pilar de verdade (nem `outro` nem `sem-texto`). */
  postsClassificados: number
  postsNoPeriodo: number
  avisos: string[]
}

/**
 * Varre o histórico classificado e devolve as campanhas candidatas.
 *
 * Nunca lança: sem classificação, devolve inventário vazio com o aviso — a
 * detecção depende dos pilares e é honesto dizer isso em vez de mostrar uma
 * tela vazia sem explicação.
 */
export async function inventariarCampanhas(
  projectId: number,
  opcoes: { desde?: Date; minimoDePosts?: number; agora?: Date } = {},
): Promise<InventarioDeCampanhas> {
  const desde = opcoes.desde ?? new Date(Date.now() - JANELA_PADRAO_DIAS * 24 * 3600_000)

  const [posts, entradas] = await Promise.all([
    db.socialPost.findMany({
      where: { projectId, status: 'POSTED', scheduledDatetime: { gte: desde } },
      orderBy: { scheduledDatetime: 'asc' },
      select: {
        id: true,
        pilar: true,
        scheduledDatetime: true,
        campaignId: true,
        caption: true,
        slotValues: true,
      },
    }),
    db.knowledgeBaseEntry.findMany({
      where: { projectId, category: 'CAMPANHAS' },
      orderBy: { createdAt: 'desc' },
      select: { id: true, title: true, status: true, expiresAt: true },
    }),
  ])

  const classificados: PostClassificado[] = posts
    .filter((p) => p.scheduledDatetime)
    .map((p) => ({
      id: p.id,
      pilar: p.pilar,
      quando: p.scheduledDatetime!,
      campaignId: p.campaignId,
      amostraDeTexto: textoDoPost({ caption: p.caption, slotValues: p.slotValues }).texto.slice(0, 90),
    }))

  const comPilarReal = classificados.filter(
    (p) => p.pilar && p.pilar !== 'outro' && p.pilar !== 'sem-texto',
  ).length

  const avisos: string[] = []
  if (comPilarReal === 0) {
    avisos.push(
      'Nenhum post do período está classificado em um pilar — a detecção de campanha depende disso. Aprove os pilares na aba Marca e classifique o histórico.',
    )
  } else if (comPilarReal < classificados.length / 4) {
    avisos.push(
      `Só ${comPilarReal} de ${classificados.length} publicações do período têm pilar — a maior parte não tem texto no sistema. As campanhas encontradas são reais, mas pode haver outras invisíveis daqui.`,
    )
  }

  const ligados = new Map<string, number>()
  for (const p of posts) if (p.campaignId) ligados.set(p.campaignId, (ligados.get(p.campaignId) ?? 0) + 1)

  return {
    candidatas: detectarCampanhas(classificados, {
      agora: opcoes.agora,
      minimoDePosts: opcoes.minimoDePosts,
    }),
    naBase: entradas.map((e) => ({
      id: e.id,
      titulo: e.title,
      status: e.status,
      expiraEm: e.expiresAt,
      postsLigados: ligados.get(e.id) ?? 0,
    })),
    postsClassificados: comPilarReal,
    postsNoPeriodo: classificados.length,
    avisos,
  }
}

export interface ConfirmacaoDeCampanha {
  projectId: number
  postIds: string[]
  /** Ligar a uma entrada CAMPANHAS que já existe. */
  campaignId?: string | null
  /** Ou criar o registro retroativo com este título. */
  titulo?: string | null
  /** Fim da campanha. Sem isso, o fim é a data da última peça. */
  fim?: Date | null
  /** `User.id` INTERNO (cuid) — NUNCA o clerkId. */
  confirmadoPor?: string | null
  pilar?: string | null
}

export interface ResultadoDaConfirmacao {
  campaignId: string
  titulo: string
  postsMarcados: number
  criouEntrada: boolean
}

/**
 * Confirma a campanha: marca os posts como CAMPANHA e os liga à entrada.
 *
 * Os posts recebem `learningScope: 'CAMPANHA'` junto — é a marca que a
 * agregação lê. Marcar só o `campaignId` deixaria o post ensinando rotina, que
 * é justamente o que se quis desfazer.
 */
export async function confirmarCampanha(
  entrada: ConfirmacaoDeCampanha,
): Promise<ResultadoDaConfirmacao> {
  const { projectId, postIds } = entrada
  if (postIds.length === 0) throw new Error('Nenhum post foi indicado para a campanha.')

  const posts = await db.socialPost.findMany({
    where: { id: { in: postIds }, projectId },
    select: { id: true, scheduledDatetime: true },
  })
  if (posts.length === 0) throw new Error('Nenhum dos posts indicados pertence a este projeto.')

  let campaignId = entrada.campaignId?.trim() || ''
  let titulo = entrada.titulo?.trim() || ''
  let criouEntrada = false

  if (campaignId) {
    const existente = await db.knowledgeBaseEntry.findFirst({
      where: { id: campaignId, projectId },
      select: { id: true, title: true },
    })
    if (!existente) throw new Error('A campanha indicada não existe neste projeto.')
    titulo = existente.title
  } else {
    if (!titulo) throw new Error('Dê um nome à campanha (ou escolha uma que já existe na base).')

    const datas = posts.map((p) => p.scheduledDatetime).filter((d): d is Date => !!d)
    const ultima = datas.length > 0 ? new Date(Math.max(...datas.map((d) => d.getTime()))) : new Date()
    const primeira = datas.length > 0 ? new Date(Math.min(...datas.map((d) => d.getTime()))) : ultima
    const fim = entrada.fim ?? ultima

    const nova = await db.knowledgeBaseEntry.create({
      data: {
        projectId,
        category: 'CAMPANHAS',
        title: titulo,
        content: [
          `Campanha reconhecida no histórico do cliente.`,
          `Período: ${primeira.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })} a ${fim.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })}.`,
          `${posts.length} publicações.`,
          entrada.pilar ? `Pilar: ${entrada.pilar}.` : '',
        ]
          .filter(Boolean)
          .join(' '),
        tags: entrada.pilar ? [entrada.pilar] : [],
        // ARCHIVED e sem indexação: é registro do que aconteceu, não
        // conhecimento para alimentar copy nova (ver o cabeçalho).
        status: 'ARCHIVED',
        expiresAt: fim,
        metadata: {
          origem: 'campanha-detectada',
          pilar: entrada.pilar ?? null,
          posts: posts.length,
          confirmadaEm: new Date().toISOString(),
        },
        createdBy: entrada.confirmadoPor ?? 'sistema',
        userId: entrada.confirmadoPor ?? null,
      },
      select: { id: true },
    })
    campaignId = nova.id
    criouEntrada = true
  }

  const r = await db.socialPost.updateMany({
    where: { id: { in: posts.map((p) => p.id) }, projectId },
    data: { campaignId, learningScope: 'CAMPANHA' },
  })

  return { campaignId, titulo, postsMarcados: r.count, criouEntrada }
}

/**
 * Desfaz a marcação de campanha nos posts indicados (não apaga a entrada).
 *
 * Existe porque confirmar é um clique e desfazer tem de ser outro: a alternativa
 * seria ir de post em post na agenda.
 */
export async function desfazerCampanha(projectId: number, postIds: string[]): Promise<number> {
  if (postIds.length === 0) return 0
  const r = await db.socialPost.updateMany({
    where: { id: { in: postIds }, projectId },
    data: { campaignId: null, learningScope: 'ROTINA' },
  })
  return r.count
}
