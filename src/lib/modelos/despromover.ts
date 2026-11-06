/**
 * Guarda da DESPROMOÇÃO de modelo ("Tirar dos modelos"; `marcar-como-modelo` com `marcar: false`).
 *
 * Por que existe: o render só aplica a copy PRÓPRIA do post (`slotValues`) quando a página é modelo
 * (`story-renderer.ts`): o contrato semântico (`_slots`/`_papeis`) em página de conteúdo lança
 * `PAGINA_DE_CONTEUDO`, e o legado (`slotValuesParaRender(slotValues, page.isTemplate)`) passa a ignorar a copy do
 * post. Despromover a página de um post vivo com copy própria muda a arte dele em silêncio — por isso a recusa.
 *
 * Módulo sem `@/lib/db` (testável sem banco): a decisão é pura; a consulta recebe o cliente de quem chama (a rota e a
 * tool rodam dentro da mesma transação que grava `isTemplate`).
 */
import type { Prisma } from '../../../prisma/generated/client'
import { copyPropriaDoPost, temContratoSemantico } from '../posts/copy-segue-a-pagina'

/** Os status em que o post ainda vai ser (re)renderizado a partir da página. */
export const STATUS_QUE_DEPENDEM = ['DRAFT', 'SCHEDULED', 'POSTING'] as const

const ROTULO: Record<string, string> = { DRAFT: 'rascunho', SCHEDULED: 'agendado', POSTING: 'publicando' }

export interface PostDaPagina {
  id: string
  status: string
  scheduledFor: Date | string | null
  /** `slotValues` com copy própria do post (contrato semântico ou legado que não é cópia da página). */
  temCopyPropria: boolean
}

/** Tipo único, não união discriminada: com `strict: false` o TS não estreita por `permitido: true/false`. */
export interface DecisaoDespromocao {
  permitido: boolean
  /** Em português, com quantos e quais posts dependem da página; `null` quando permitido. */
  mensagem: string | null
  posts: Array<Pick<PostDaPagina, 'id' | 'status' | 'scheduledFor'>>
}

export function postTemCopyPropria(slotValues: unknown): boolean {
  return temContratoSemantico(slotValues) || copyPropriaDoPost(slotValues) !== undefined
}

export function decidirDespromocao(posts: PostDaPagina[]): DecisaoDespromocao {
  const dependentes = posts.filter(
    (p) => p.temCopyPropria && (STATUS_QUE_DEPENDEM as readonly string[]).includes(p.status),
  )
  if (dependentes.length === 0) return { permitido: true, mensagem: null, posts: [] }

  const n = dependentes.length
  const lista = dependentes
    .slice(0, 5)
    .map((p) => `${p.id} (${ROTULO[p.status] ?? p.status})`)
    .join(', ')
  const resto = n > 5 ? ` e mais ${n - 5}` : ''
  const mensagem =
    `${n === 1 ? '1 post usa' : `${n} posts usam`} esta página com copy própria: ${lista}${resto}. ` +
    'O render só aplica essa copy quando a página é modelo, então tirar dos modelos mudaria a arte ' +
    `${n === 1 ? 'dele' : 'deles'}. Troque a arte ou cancele ${n === 1 ? 'esse post' : 'esses posts'} antes.`

  return {
    permitido: false,
    mensagem,
    posts: dependentes.map(({ id, status, scheduledFor }) => ({ id, status, scheduledFor })),
  }
}

/** Os posts vivos que apontam para a página, no formato que a decisão lê. */
export async function postsQueDependemDaPagina(
  client: Pick<Prisma.TransactionClient, 'socialPost'>,
  pageId: string,
): Promise<PostDaPagina[]> {
  const rows = await client.socialPost.findMany({
    where: { pageId, status: { in: [...STATUS_QUE_DEPENDEM] } },
    select: { id: true, status: true, scheduledDatetime: true, slotValues: true },
    orderBy: { scheduledDatetime: 'asc' },
  })
  return rows.map((r) => ({
    id: r.id,
    status: r.status,
    scheduledFor: r.scheduledDatetime,
    temCopyPropria: postTemCopyPropria(r.slotValues),
  }))
}
