/**
 * Junção do restack do PR 12 sobre o PR 11 ebcebab8 (21/09/2026): a main trouxe
 * a observação do lembrete (`observacao` → `reminderExtraInfo`, 96bbe3af) para
 * o `agendarPost` inteiro, e o PR 12 o divide em resolver → criar → efeitos. A
 * observação é DECIDIDA no resolver (aparada, com o aviso quando o post publica
 * sozinho) e GRAVADA no create, por qualquer cliente: o `db` de `agendarPost` e
 * a transação do lote (`criarPostDoAgendamento`).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const banco = vi.hoisted(() => {
  const posts: Array<Record<string, unknown>> = []
  const criar = async ({ data }: { data: Record<string, unknown> }) => {
    const post = { id: `post-${posts.length + 1}`, ...data }
    posts.push(post)
    return post
  }
  return { posts, criar }
})

vi.mock('@/lib/db', () => ({
  db: {
    project: { findUnique: async () => ({ id: 8, name: 'Lagosta Criativa', userId: 'dono-interno', instagramAccountId: null }) },
    generation: { findFirst: async () => null },
    socialPost: { create: banco.criar },
    knowledgeBaseEntry: { findFirst: async () => null },
  },
}))
vi.mock('@prisma/client', async () => await import('../../../../prisma/generated/client'))
vi.mock('@/lib/creatives/persist', () => ({ getPublicAppUrl: () => 'https://studio.test' }))
vi.mock('@/lib/creatives/ingerir-midia', () => ({ ingerirMidiaExterna: async (urls: string[]) => ({ urls, falhas: [] }) }))
vi.mock('@/lib/aprendizado/sinal-de-agendamento', () => ({
  registrarSlotDoPost: async () => true,
  registrarCopyDoPost: async () => true,
  fecharSugestaoDeSlot: async () => true,
}))
vi.mock('@/lib/aprendizado/sinal-de-legenda', () => ({ registrarLegendaDoPost: async () => true }))
vi.mock('@/lib/posts/artes-do-post', () => ({ registrarArtesDoPost: async () => ({ artes: [] }) }))

import { agendarPost, criarPostDoAgendamento, resolverAgendamento } from '../agendar'

const base = { projectId: 8, mediaUrls: ['https://blob.test/arte.png'], postType: 'STORY' as const, scheduledDatetime: '2026-10-01 10:00' }
const AVISO = /A observação só vai no lembrete/

beforeEach(() => {
  banco.posts.length = 0
})

describe('observação do lembrete no agendarPost dividido', () => {
  it('lembrete: a observação vai aparada para reminderExtraInfo, sem aviso', async () => {
    const r = await agendarPost({ ...base, lembrete: true, observacao: '  enquete: chopp ou drink?  ' })
    expect(banco.posts[0]).toMatchObject({ publishType: 'REMINDER', reminderExtraInfo: 'enquete: chopp ou drink?' })
    expect((r as { aviso?: string }).aviso ?? '').not.toMatch(AVISO)
  })

  it('post automático: a observação fica guardada e o aviso diz que ninguém a recebe', async () => {
    const r = await agendarPost({ ...base, observacao: 'recado' })
    expect(banco.posts[0].reminderExtraInfo).toBe('recado')
    expect((r as { aviso?: string }).aviso).toMatch(AVISO)
  })

  it('sem observação (ou só espaços): reminderExtraInfo nulo', async () => {
    await agendarPost(base)
    await agendarPost({ ...base, observacao: '   ' })
    expect(banco.posts.map((p) => p.reminderExtraInfo)).toEqual([null, null])
  })

  it('o caminho do lote: o resolver decide e o create grava pelo cliente de quem chama', async () => {
    const r = await resolverAgendamento({ ...base, lembrete: true, observacao: ' para a enquete ' })
    expect(r.observacao).toBe('para a enquete')
    const escritos: Array<Record<string, unknown>> = []
    await criarPostDoAgendamento({ socialPost: { create: async ({ data }: { data: Record<string, unknown> }) => (escritos.push(data), { id: 'p-tx', ...data }) } } as never, r)
    expect(escritos[0]).toMatchObject({ reminderExtraInfo: 'para a enquete' })
    expect(banco.posts).toEqual([])
  })
})
