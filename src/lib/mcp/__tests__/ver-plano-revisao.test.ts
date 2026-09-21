import { describe, expect, it, vi } from 'vitest'

/**
 * Pré-revisão C11-1a do PR 11: o ver-plano devolve, por item, a `itemRevisao` —
 * a MESMA revisão de conteúdo que o caminho do plano confere sob a trava do
 * item. Os módulos com banco e Clerk que tools.ts puxa são trocados só pelo que
 * `itemParaChat` não usa.
 */
vi.mock('@/lib/db', () => ({ db: {} }))
vi.mock('@/lib/auth-utils', () => ({ getUserFromClerkId: vi.fn() }))
vi.mock('@/lib/projects/access', () => ({ projectOwnerIdsFor: vi.fn() }))
vi.mock('@/lib/posts/agenda-acoes', () => ({ formatarBRT: (d: Date) => new Date(d).toISOString() }))
vi.mock('@/lib/planos/plano-service', () => ({ lerPlano: vi.fn(), planoAtivo: vi.fn() }))

import { itemParaChat } from '../tools'
import { revisaoDoItem } from '@/lib/planos/revisao-do-item'

const item = {
  id: 'item-1', planoId: 'plano-1', projectId: 6, status: 'proposto', ordem: 0, updatedAt: new Date('2026-09-08'),
  copyProposta: ['Costela no bafo', 'Vem pra cá'], copyAutoral: null, fotoDriveId: 'drive-1', fotoUrl: null, fotoCandidatas: null,
  formato: 'story', quando: new Date('2026-09-14T22:00:00.000Z'), tema: 'Rodízio', legenda: 'Legenda', via: 'compor',
  direcao: null, ajusteDaFoto: null, referencias: null, clienteProjectId: null, clienteCitadoNome: null, motivoDoSlot: null,
  motivoReprovacao: null, erro: null, generationId: null, pageId: null, postId: null,
} as unknown as Parameters<typeof itemParaChat>[0]

describe('ver-plano: a itemRevisao de cada item', () => {
  it('é a revisão de conteúdo que o caminho do plano confere, estável nas transições e na legenda, e muda com a copy', () => {
    const lido = itemParaChat(item)
    expect(lido.itemRevisao).toBe(revisaoDoItem(item))
    expect(lido.itemRevisao).toMatch(/^rev1:[0-9a-f]{32}$/)
    expect(itemParaChat({ ...item, status: 'erro', erro: 'falhou', generationId: 'g1' } as typeof item).itemRevisao).toBe(lido.itemRevisao)
    expect(itemParaChat({ ...item, legenda: 'Outra legenda' } as typeof item).itemRevisao).toBe(lido.itemRevisao)
    expect(itemParaChat({ ...item, copyProposta: ['Costela no bafo', 'Reserve já'] } as typeof item).itemRevisao).not.toBe(lido.itemRevisao)
  })
})
