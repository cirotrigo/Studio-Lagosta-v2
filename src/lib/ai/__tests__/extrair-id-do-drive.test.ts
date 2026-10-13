import { describe, expect, it, vi } from 'vitest'

vi.mock('@/server/google-drive-service', () => ({ googleDriveService: {} }))

import { extractDriveFileId } from '../fetch-image-source'

/**
 * Toda forma de URL do Drive tem de virar id — é por ele que a foto é conferida
 * contra as pastas do projeto. Uma forma que escapa vira "URL comum" e passa
 * sem conferência.
 */
describe('extractDriveFileId', () => {
  it.each([
    ['/api/google-drive/image/abc_1-2', 'abc_1-2'],
    ['https://studio.x/api/drive/thumbnail/abc_1-2?size=400', 'abc_1-2'],
    ['https://lh3.googleusercontent.com/d/abc_1-2=w1000', 'abc_1-2'],
    ['https://drive.google.com/uc?id=abc_1-2', 'abc_1-2'],
    ['https://drive.google.com/uc?export=view&id=abc_1-2', 'abc_1-2'],
    ['https://drive.google.com/uc?id=abc_1-2&export=download', 'abc_1-2'],
    ['https://drive.google.com/open?id=abc_1-2', 'abc_1-2'],
    ['https://drive.google.com/file/d/abc_1-2/view?usp=sharing', 'abc_1-2'],
    ['https://docs.google.com/uc?id=abc_1-2', 'abc_1-2'],
    ['https://drive.usercontent.google.com/download?id=abc_1-2', 'abc_1-2'],
  ])('%s → %s', (url, id) => {
    expect(extractDriveFileId(url)).toBe(id)
  })

  it.each(['https://loja.public.blob.vercel-storage.com/a.png', 'https://example.com/uc?id=abc', 'nada'])(
    '%s não é do Drive',
    (url) => {
      expect(extractDriveFileId(url)).toBeNull()
    },
  )
})
