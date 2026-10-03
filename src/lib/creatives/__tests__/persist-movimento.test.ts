/**
 * Fase 2 do plano de 03/10/2026: o render de servidor de uma página com foto em
 * movimento é o quadro de t = 0 — e só em página-vídeo. Com música a página É
 * vídeo, então o `renderPageAndRegister` precisa do áudio da página: quem o
 * chama com a página montada à mão não o traz, e ele é lido do banco (só quando
 * há movimento). O `renderPageAndRegister` de verdade, com o banco em memória e
 * o render falso guardando o design que receberia.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const banco = vi.hoisted(() => ({
  audio: null as unknown,
  leiturasDoAudio: 0,
  desenhado: null as { layers: Array<Record<string, unknown>> } | null,
}))

vi.mock('@/lib/db', () => {
  const db: Record<string, any> = {
    page: {
      findUnique: async ({ select }: { select?: Record<string, boolean> }) => {
        if (select?.audio) banco.leiturasDoAudio += 1
        return { audio: banco.audio }
      },
      update: async () => ({}),
    },
    generation: { create: async () => ({ id: 'gen-1' }), update: async ({ where }: { where: { id: string } }) => ({ id: where.id }) },
    $executeRaw: async () => 1,
    $queryRaw: async () => [],
    $transaction: async (arg: unknown) => (typeof arg === 'function' ? (arg as (tx: unknown) => unknown)(db) : Promise.all(arg as unknown[])),
  }
  return { db }
})
vi.mock('@prisma/client', async () => await import('../../../../prisma/generated/client'))
vi.mock('@vercel/blob', () => ({ put: vi.fn(async (caminho: string) => ({ url: `https://blob.test/${caminho}` })), del: vi.fn() }))
vi.mock('@/lib/canvas-renderer', () => ({
  CanvasRenderer: class {
    async renderDesign(design: { layers: Array<Record<string, unknown>> }) {
      banco.desenhado = design
      return Buffer.from('png-falso')
    }
  },
}))
vi.mock('@/lib/posts/register-project-fonts', () => ({ registerProjectFonts: async () => undefined, fetchBuffer: vi.fn() }))

import { renderPageAndRegister } from '../persist'
import { QUADRO_ANOTADO } from '@/lib/video/movimento'

const MUSICA = { source: 'library', musicId: 5, startTime: 0, endTime: 6 }
const foto = (extra: Record<string, unknown> = {}) => ({
  id: 'foto',
  type: 'image',
  fileUrl: 'https://blob.test/foto.png',
  visible: true,
  order: 0,
  position: { x: 0, y: 0 },
  size: { width: 1080, height: 1920 },
  ...extra,
})
const renderizar = (page: Record<string, unknown>) =>
  renderPageAndRegister({
    project: { id: 8, name: 'Lagosta Criativa', userId: 'dono-interno' },
    templateId: 77,
    templateName: 'Programação',
    page: { id: 'p1', name: 'Seg', width: 1080, height: 1920, background: '#101010', ...page } as never,
    fieldValues: { source: 'ajuste-arte' },
    authorName: 'ajuste-arte',
  })
const quadroDesenhado = () => banco.desenhado?.layers.find((l) => l.id === 'foto')?.[QUADRO_ANOTADO]

beforeEach(() => {
  banco.audio = null
  banco.leiturasDoAudio = 0
  banco.desenhado = null
})

describe('renderPageAndRegister — o quadro de t = 0 da foto em movimento', () => {
  it('sem o áudio em mãos, ele é LIDO do banco: com música a página é vídeo e "afastar" começa em 1,15', async () => {
    banco.audio = MUSICA
    await renderizar({ layers: [foto({ movimento: 'afastar' })] })
    expect(banco.leiturasDoAudio).toBe(1)
    expect(quadroDesenhado()).toEqual({ escala: 1.15, deslocamentoX: 0 })
  })

  it('o áudio passado vale: sem música e sem sequência a página é imagem — nada é anotado nem lido', async () => {
    banco.audio = MUSICA
    await renderizar({ layers: [foto({ movimento: 'afastar' })], audio: null })
    expect(banco.leiturasDoAudio).toBe(0)
    expect(quadroDesenhado()).toBeUndefined()
  })

  it('controle: sem movimento o banco não é consultado', async () => {
    banco.audio = MUSICA
    await renderizar({ layers: [foto()] })
    expect(banco.leiturasDoAudio).toBe(0)
    expect(quadroDesenhado()).toBeUndefined()
  })
})
