/**
 * C6-03 da pré-revisão do HEAD f0eee811 (12/09/2026): trocar a arte de um
 * rascunho por uma arte da GALERIA deriva a cópia textual do post pela mesma
 * procedência de `agendarPost` — R38 do PR 6 e o marcador da copy visual
 * regravada do PR 0. O banco é falso; o serviço é o real.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const banco = vi.hoisted(() => ({
  post: null as Record<string, any> | null,
  generations: [] as Array<Record<string, any>>,
  updates: [] as Array<Record<string, any>>,
}))

vi.mock('@/lib/db', () => ({
  db: {
    socialPost: {
      findUnique: async () => banco.post,
      updateMany: async ({ data }: { data: Record<string, unknown> }) => {
        banco.updates.push(data)
        return { count: 1 }
      },
    },
    generation: {
      findFirst: async ({ where }: { where: { id: string; projectId: number } }) =>
        banco.generations.find((g) => g.id === where.id && g.projectId === where.projectId) ?? null,
    },
    postLog: { create: async () => ({}) },
  },
}))
vi.mock('@prisma/client', async () => await import('../../../../prisma/generated/client'))
vi.mock('@/lib/creatives/ingerir-midia', () => ({ ingerirMidiaExterna: async (urls: string[]) => ({ urls, falhas: [] }) }))
vi.mock('@/lib/creatives/persist', () => ({ getPublicAppUrl: () => 'https://studio.test', renderPageAndRegister: vi.fn() }))
vi.mock('@/lib/aprendizado/captura', () => ({ registrarDecisaoSemSugestao: async () => null }))

import { Prisma } from '../../../../prisma/generated/client'
import { AVISO_COPY_DE_ARTE_RE_RENDERIZADA } from '@/lib/creatives/procedencia-da-copy'
import { trocarArteDoPost } from '../trocar-arte-do-post'

const URL_B = 'https://blob.test/arte-rapida/8/B.png'

function arte(id: string, fieldValues: Record<string, unknown>) {
  return { id, projectId: 8, resultUrl: URL_B, fieldValues }
}

beforeEach(() => {
  banco.updates = []
  banco.generations = []
  banco.post = {
    id: 'post-1',
    projectId: 8,
    status: 'DRAFT',
    laterPostId: null,
    mediaUrls: ['https://blob.test/arte-rapida/8/antiga.png'],
    pageId: null,
    templateId: null,
    postType: 'STORY',
    scheduledDatetime: null,
    campaignId: null,
    slotValues: { headline: 'Copy da arte anterior' },
  }
})

async function trocarPor(fieldValues: Record<string, unknown>) {
  banco.generations = [arte('gen-nova', fieldValues)]
  const r = await trocarArteDoPost({ projectId: 8, postId: 'post-1', generationId: 'gen-nova' })
  expect(banco.updates).toHaveLength(1)
  expect(banco.updates[0].mediaUrls).toEqual([URL_B])
  return { r, data: banco.updates[0] }
}

describe('trocarArteDoPost pela galeria — a copy do post segue a procedência da arte (C6-03)', () => {
  it('arte RE-RENDERIZADA sem o marcador: o post NÃO recebe a copy de outra versão — fica sem cópia textual, com o aviso de agendarPost', async () => {
    const { r, data } = await trocarPor({ source: 'ajuste-arte', slotValues: { headline: 'Copy A de outra versão' }, recomposicao: { estado: 're-renderizada' } })
    expect(data.slotValues).toBe(Prisma.DbNull)
    expect(r.avisos).toContain(AVISO_COPY_DE_ARTE_RE_RENDERIZADA)
    expect(JSON.stringify(data)).not.toContain('Copy A')
  })

  it('arte re-renderizada COM a copy visual regravada no mesmo re-render: o post recebe a copy regravada, sem aviso', async () => {
    const { r, data } = await trocarPor({ source: 'ajuste-arte', slotValues: { headline: 'Copy B regravada' }, recomposicao: { estado: 're-renderizada', copyVisualRegravada: true } })
    expect(data.slotValues).toEqual({ headline: 'Copy B regravada' })
    expect(r.avisos ?? []).not.toContain(AVISO_COPY_DE_ARTE_RE_RENDERIZADA)
  })

  it('controle: arte não re-renderizada copia a copy dela, como antes', async () => {
    const { r, data } = await trocarPor({ source: 'post-schedule', slotValues: { headline: 'Copy C legítima', _driveImageId: 'x' } })
    expect(data.slotValues).toEqual({ headline: 'Copy C legítima' })
    expect(r.avisos ?? []).not.toContain(AVISO_COPY_DE_ARTE_RE_RENDERIZADA)
  })

  it('controle: arte sem texto conhecido (não invalidada) mantém o contrato "null = não apaga" — o update não mexe em slotValues', async () => {
    const { r, data } = await trocarPor({ source: 'geracao-ia' })
    expect('slotValues' in data).toBe(false)
    expect(r.avisos ?? []).not.toContain(AVISO_COPY_DE_ARTE_RE_RENDERIZADA)
  })
})
