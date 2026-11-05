/**
 * Listagem crua do acervo (projeto sem catálogo): atalho só entra se o
 * destino também estiver sob as pastas DESTE projeto — para qualquer
 * chamador, como o resto da operação de projeto.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { drive, zerarArvore } from '@/lib/google-drive/__tests__/arvore-falsa'

vi.mock('@/server/google-drive-service', async () => ({
  googleDriveService: (await import('@/lib/google-drive/__tests__/arvore-falsa')).drive,
}))
vi.mock('@/lib/db', async () => ({ db: (await import('@/lib/google-drive/__tests__/arvore-falsa')).dbFalso }))
vi.mock('@/lib/admin-utils', () => ({ isAdmin: async () => true }))
vi.mock('@prisma/client', async () => await import('../../../../prisma/generated/client'))

import { listarImagensDoDrive } from '../acervo'

beforeEach(() => {
  zerarArvore()
  vi.spyOn(console, 'warn').mockImplementation(() => undefined)
})

describe('listarImagensDoDrive', () => {
  it('atalho na pasta do projeto 2 para a foto do projeto 1 não aparece', async () => {
    const r = await listarImagensDoDrive(2)
    expect(r.images.map((i) => i.driveFileId)).toContain('fileB')
    expect(JSON.stringify(r)).not.toMatch(/shortB|fileA/)
  })
  it('atalho não entra na listagem crua, nem com destino no mesmo projeto (a varredura em lote consulta pelo mimeType de imagem, #128)', async () => {
    const r = await listarImagensDoDrive(1)
    expect(r.images.map((i) => i.driveFileId)).toEqual(['fileAimg'])
    expect(JSON.stringify(r)).not.toMatch(/short/)
  })
})
