import { describe, expect, it, vi } from 'vitest'

// O módulo também lê o banco; aqui só a parte pura.
vi.mock('@/lib/db', () => ({ db: {} }))

import { estadoDaSubstituicao } from '../estado-do-video-do-post'

const criadaEm = new Date('2026-10-03T12:00:00Z')
const linha = (extra: { status?: string; errorMessage?: string | null; resultado?: unknown }) => ({
  id: 'g1',
  status: extra.status ?? 'PROCESSING',
  createdAt: criadaEm,
  errorMessage: extra.errorMessage ?? null,
  video: {
    pageId: 'p1',
    destino: { tipo: 'substituir', postId: 'post1' },
    ...(extra.resultado ? { resultado: extra.resultado } : {}),
  },
})

describe('estadoDaSubstituicao', () => {
  it('sem linha não há substituição', () => {
    expect(estadoDaSubstituicao(undefined)).toBeNull()
  })

  it('em produção até o destino rodar', () => {
    expect(estadoDaSubstituicao(linha({}))).toEqual({
      estado: 'em-producao',
      generationId: 'g1',
      desde: criadaEm.toISOString(),
    })
  })

  it('feita e recusada saem do resultado do destino', () => {
    expect(estadoDaSubstituicao(linha({ status: 'COMPLETED', resultado: { ok: true, revisaoDepois: 'r', em: 'x' } }))).toEqual({
      estado: 'feita',
      generationId: 'g1',
      em: 'x',
    })
    expect(
      estadoDaSubstituicao(linha({ status: 'COMPLETED', resultado: { ok: false, motivo: 'post entregue', em: 'y' } })),
    ).toEqual({ estado: 'recusada', generationId: 'g1', em: 'y', motivo: 'post entregue' })
  })

  it('vídeo que falhou diz o motivo, com um padrão em português', () => {
    expect(estadoDaSubstituicao(linha({ status: 'FAILED', errorMessage: 'ffmpeg caiu' }))).toMatchObject({
      estado: 'falhou',
      motivo: 'ffmpeg caiu',
    })
    expect(estadoDaSubstituicao(linha({ status: 'FAILED' }))).toMatchObject({
      estado: 'falhou',
      motivo: 'O vídeo novo não ficou pronto.',
    })
  })
})
