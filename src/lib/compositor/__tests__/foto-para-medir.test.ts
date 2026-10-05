import { readFileSync } from 'node:fs'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ fetch: vi.fn(), driveMeta: vi.fn(), enabled: vi.fn(() => true) }))
vi.mock('@/lib/posts/register-project-fonts', () => ({ fetchBuffer: mocks.fetch }))
vi.mock('@/server/google-drive-service', () => ({ googleDriveService: { isEnabled: mocks.enabled, getFileMetadata: mocks.driveMeta } }))

import { carregarFotoParaMedir } from '../foto-para-medir'

let png: Buffer
beforeAll(async () => {
  const sharp = (await import('sharp')).default
  png = await sharp({ create: { width: 4, height: 6, channels: 3, background: { r: 128, g: 128, b: 128 } } }).png().toBuffer()
})
beforeEach(() => {
  vi.clearAllMocks()
  mocks.enabled.mockReturnValue(true)
  mocks.fetch.mockResolvedValue(png)
})

describe('carregarFotoParaMedir — os bytes da foto sem publicar nada (R10)', () => {
  it('o módulo não importa o Blob nem o `persist.ts` (é a garantia estrutural de que a medição não escreve)', () => {
    const fonte = readFileSync(new URL('../foto-para-medir.ts', import.meta.url), 'utf8')
    // só IMPORTS e CHAMADAS contam — o docstring cita `resolveImageUrl` para dizer o que NÃO faz
    expect(fonte).not.toMatch(/^import[^\n]*(@vercel\/blob|persist')/m)
    expect(fonte).not.toMatch(/resolveImageUrl\(|\bput\(/)
  })
  it('sem foto na spec: nada, sem aviso', async () => {
    expect(await carregarFotoParaMedir({})).toEqual({ foto: null, aviso: null })
    expect(mocks.fetch).not.toHaveBeenCalled()
  })
  it('foto por URL: baixa a URL dada, mede largura e altura, mantém a URL; o Drive não é consultado', async () => {
    const r = await carregarFotoParaMedir({ foto: { url: 'https://cdn.example/foto.jpg' } })
    expect(mocks.fetch).toHaveBeenCalledWith('https://cdn.example/foto.jpg')
    expect(mocks.driveMeta).not.toHaveBeenCalled()
    expect(r.aviso).toBeNull()
    expect(r.foto).toMatchObject({ url: 'https://cdn.example/foto.jpg', largura: 4, altura: 6 })
    expect(r.foto?.bytes).toBe(png)
  })
  it('foto do Drive: pede só o thumbnailLink, baixa a miniatura em s1920 e NÃO devolve URL pública (nada foi publicado)', async () => {
    mocks.driveMeta.mockResolvedValue({ thumbnailLink: 'https://lh3.example/x=s220' })
    const r = await carregarFotoParaMedir({ foto: { driveFileId: 'drive-1' } })
    expect(mocks.driveMeta).toHaveBeenCalledWith('drive-1', 'thumbnailLink')
    expect(mocks.fetch).toHaveBeenCalledWith('https://lh3.example/x=s1920')
    expect(r.foto).toMatchObject({ url: null, largura: 4, altura: 6 })
  })
  it('Drive desligado, arquivo sem thumbnailLink ou erro do Drive: sem foto, com o aviso — nunca lança', async () => {
    mocks.enabled.mockReturnValue(false)
    expect((await carregarFotoParaMedir({ foto: { driveFileId: 'drive-1' } })).aviso).toMatch(/Google Drive não configurado/)
    mocks.enabled.mockReturnValue(true)
    mocks.driveMeta.mockResolvedValue({})
    expect((await carregarFotoParaMedir({ foto: { driveFileId: 'drive-1' } })).aviso).toMatch(/não tem thumbnailLink/)
    mocks.driveMeta.mockRejectedValue(new Error('403'))
    const r = await carregarFotoParaMedir({ foto: { driveFileId: 'drive-1' } })
    expect(r.foto).toBeNull()
    expect(r.aviso).toMatch(/Falha ao resolver a imagem no Drive: 403/)
    expect(mocks.fetch).not.toHaveBeenCalled()
  })
})
