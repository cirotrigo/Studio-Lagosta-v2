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
  // sem subpastas: a varredura fica na pasta configurada
  drive.listFiles.mockResolvedValue({ items: [] })
  vi.spyOn(console, 'warn').mockImplementation(() => undefined)
})

describe('listarImagensDoDrive', () => {
  it('atalho na pasta do projeto 2 para a foto do projeto 1 não aparece', async () => {
    const r = await listarImagensDoDrive(2)
    expect(r.images.map((i) => i.driveFileId)).toContain('fileB')
    expect(JSON.stringify(r)).not.toMatch(/shortB|fileA/)
  })
  it('atalho com destino no mesmo projeto continua', async () => {
    drive.listFolderFiles.mockResolvedValueOnce([
      { id: 'shortOk', name: 'ok', mimeType: 'image/jpeg', webContentLink: null, shortcutDetails: { targetId: 'fileAimg', targetMimeType: 'image/jpeg' } },
      { id: 'shortA', name: 'fora', mimeType: 'image/jpeg', webContentLink: null, shortcutDetails: { targetId: 'fileB', targetMimeType: 'image/jpeg' } },
    ] as never)
    const r = await listarImagensDoDrive(1)
    expect(r.images.map((i) => i.driveFileId)).toEqual(['shortOk'])
  })
})
