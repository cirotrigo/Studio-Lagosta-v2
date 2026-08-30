/**
 * Caixa de respostas — as pendências de conversa da carteira, num lugar só.
 *
 * Duas fontes, dois contratos de envio:
 * - COMENTÁRIOS de Instagram: lidos ao vivo do Windsor (não são persistidos —
 *   comentário é conversa, não série histórica). Envio server-side pela
 *   Graph API com o token do projeto; sem token, a Caixa entrega o rascunho
 *   com "copiar" e a pessoa publica pelo app do Instagram.
 * - AVALIAÇÕES do Google: lidas de `AvaliacaoGoogle` (a coleta diária das
 *   09h). O envio server-side NÃO existe hoje — a API de ações do Windsor só
 *   é alcançável pelo conector OAuth (medido em 30/08/2026: /mcp por API key
 *   responde "We don't have this connector yet!"). O envio fica no Farol; a
 *   Caixa entrega o rascunho pronto para copiar.
 */
import { db } from '@/lib/db'
import { isWindsorConfigured, texto, windsorGet } from '@/lib/windsor/client'

export interface ComentarioPendente {
  tipo: 'comentario'
  projectId: number
  cliente: string
  comentarioId: string
  autorDesconhecido: true
  texto: string
  quando: string
  linkDoPost: string | null
  /** true = o app consegue ENVIAR a resposta (token do projeto). */
  enviaDaqui: boolean
  quente: boolean
}

export interface AvaliacaoPendente {
  tipo: 'avaliacao'
  projectId: number
  cliente: string
  reviewId: string
  autor: string | null
  estrelas: number
  texto: string | null
  quando: string
  respostaSugerida: string | null
  enviaDaqui: false
}

const PALAVRAS_QUENTES =
  /reserv|pre[çc]o|valor|hor[áa]rio|funciona|abre|aberto|vegan|vegetarian|entrega|delivery|card[áa]pio|menu|quanto|aceita|estacionamento|\?/i

const FIELDS_COMENTARIOS = [
  'account_id',
  'account_name',
  'comment_id',
  'comment_parent_id',
  'comment_text',
  'comment_timestamp',
  'comment_reply_count',
  'media_permalink',
]

/** Comentários sem resposta dos últimos 14 dias, só dos projetos visíveis. */
async function comentariosPendentes(
  projetos: Array<{ id: number; name: string; instagramUsername: string | null; temToken: boolean }>,
): Promise<ComentarioPendente[]> {
  if (!isWindsorConfigured()) return []
  const porUsername = new Map(
    projetos.filter((p) => p.instagramUsername).map((p) => [p.instagramUsername as string, p]),
  )

  let linhas: Array<Record<string, unknown>>
  try {
    linhas = await windsorGet('instagram', { fields: FIELDS_COMENTARIOS, datePreset: 'last_14dT' })
  } catch (erro) {
    console.error('[caixa] comentários via Windsor falharam (seguindo sem eles):', erro)
    return []
  }

  // Decisão de não responder é da EQUIPE e vale para todos — mora no banco.
  const ignorados = new Set(
    (
      await db.comentarioIgnorado.findMany({
        where: { projectId: { in: projetos.map((p) => p.id) } },
        select: { comentarioId: true },
      })
    ).map((i) => i.comentarioId),
  )

  const itens: ComentarioPendente[] = []
  for (const l of linhas) {
    const id = texto(l.comment_id)
    const corpo = texto(l.comment_text)
    const quando = texto(l.comment_timestamp)
    const projeto = porUsername.get(texto(l.account_name) ?? '')
    if (!id || !corpo || !quando || !projeto) continue
    if (ignorados.has(id)) continue
    if (texto(l.comment_parent_id)) continue // resposta de alguém, não pendência
    if (typeof l.comment_reply_count === 'number' && l.comment_reply_count > 0) continue
    itens.push({
      tipo: 'comentario',
      projectId: projeto.id,
      cliente: projeto.name,
      comentarioId: id,
      autorDesconhecido: true,
      texto: corpo,
      quando,
      linkDoPost: texto(l.media_permalink),
      enviaDaqui: projeto.temToken,
      quente: PALAVRAS_QUENTES.test(corpo),
    })
  }
  return itens.sort((a, b) => {
    if (a.quente !== b.quente) return a.quente ? -1 : 1
    return b.quando.localeCompare(a.quando)
  })
}

/** Avaliações do Google sem resposta (janela da coleta), negativas primeiro. */
async function avaliacoesPendentes(projectIds: number[]): Promise<AvaliacaoPendente[]> {
  const nomes = new Map(
    (await db.project.findMany({ where: { id: { in: projectIds } }, select: { id: true, name: true } })).map((p) => [
      p.id,
      p.name,
    ]),
  )
  const linhas = await db.avaliacaoGoogle.findMany({
    where: { projectId: { in: projectIds }, respondidaEm: null, ignoradaEm: null },
    orderBy: [{ estrelas: 'asc' }, { criadaEm: 'desc' }],
    take: 200,
  })
  return linhas.map((a) => ({
    tipo: 'avaliacao' as const,
    projectId: a.projectId,
    cliente: nomes.get(a.projectId) ?? `projeto ${a.projectId}`,
    reviewId: a.reviewId,
    autor: a.autor,
    estrelas: a.estrelas,
    texto: a.texto,
    quando: a.criadaEm.toISOString(),
    respostaSugerida: a.respostaSugerida,
    enviaDaqui: false as const,
  }))
}

export interface CaixaDeRespostas {
  comentarios: ComentarioPendente[]
  avaliacoes: AvaliacaoPendente[]
  clientes: Array<{ projectId: number; nome: string }>
}

export async function montarCaixa(
  projetos: Array<{ id: number; name: string; instagramUsername: string | null; temToken: boolean }>,
): Promise<CaixaDeRespostas> {
  const [comentarios, avaliacoes] = await Promise.all([
    comentariosPendentes(projetos),
    avaliacoesPendentes(projetos.map((p) => p.id)),
  ])
  const comPendencia = new Set([...comentarios, ...avaliacoes].map((i) => i.projectId))
  return {
    comentarios,
    avaliacoes,
    clientes: projetos
      .filter((p) => comPendencia.has(p.id))
      .map((p) => ({ projectId: p.id, nome: p.name }))
      .sort((a, b) => a.nome.localeCompare(b.nome)),
  }
}
