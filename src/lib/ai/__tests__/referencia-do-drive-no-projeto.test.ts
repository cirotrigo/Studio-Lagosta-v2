/**
 * Referência do Drive numa geração com IA precisa estar sob as pastas do
 * projeto da geração — vale para qualquer chamador (gerar-imagem, lote,
 * carrossel, plano; pessoa, serviço ou admin). Fora delas, 404 e nenhum job.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { zerarArvore } from '@/lib/google-drive/__tests__/arvore-falsa'

const m = vi.hoisted(() => ({ criado: false }))

vi.mock('@/server/google-drive-service', async () => ({
  googleDriveService: (await import('@/lib/google-drive/__tests__/arvore-falsa')).drive,
}))
vi.mock('@/lib/db', async () => {
  const { dbFalso } = await import('@/lib/google-drive/__tests__/arvore-falsa')
  const passou = async () => {
    throw new Error('passou da referência')
  }
  return {
    db: {
      ...dbFalso,
      generation: {
        findFirst: passou,
        findMany: passou,
        create: async () => {
          m.criado = true
          return { id: 'g' }
        },
      },
    },
  }
})
vi.mock('@/lib/admin-utils', () => ({ isAdmin: async () => true }))
vi.mock('@/lib/credits/deduct', () => ({ validateCreditsForFeature: vi.fn(), deductCreditsForFeature: vi.fn() }))
vi.mock('@/lib/credits/settings', () => ({ getFeatureCost: vi.fn(async () => 1) }))
vi.mock('@/lib/ai/openai-image-client', () => ({ getCurrentImageModel: () => 'gpt-image' }))
vi.mock('@/lib/ai/creative-improvement-service', () => ({
  VERCEL_BLOB_HOST_REGEX: /^https:\/\/[a-z0-9-]+\.public\.blob\.vercel-storage\.com\//,
}))
vi.mock('@/lib/creatives/persist', () => ({ ensureArteTemplate: vi.fn() }))

import { startArtGeneration } from '../creative-generation-service'

beforeEach(() => {
  zerarArvore()
  m.criado = false
  vi.spyOn(console, 'warn').mockImplementation(() => undefined)
})

const gerar = (driveFileId: string) =>
  startArtGeneration({
    projectId: 1,
    track: 'imagem',
    formato: 'story',
    pedido: 'cena da casa',
    referencias: [{ role: 'subject', driveFileId }],
  } as never)

describe('startArtGeneration — referência do Drive', () => {
  it('foto sob as pastas do projeto passa da conferência (o resto da geração não é deste teste)', async () => {
    for (const id of ['fileA', 'fileAimg', 'shortA']) {
      const erro = await gerar(id).catch((e) => e)
      expect(erro?.code).not.toBe('FOTO_NAO_ENCONTRADA')
    }
  })
  it.each(['fileB', 'nao-existe', 'boom', 'root', "x' in parents or 'rootA"])(
    'foto fora do projeto (%s): 404 antes de qualquer job, mesmo para admin/serviço',
    async (id) => {
      await expect(gerar(id)).rejects.toMatchObject({ code: 'FOTO_NAO_ENCONTRADA', status: 404 })
      expect(m.criado).toBe(false)
    },
  )
})
