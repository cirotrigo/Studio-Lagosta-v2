/**
 * Foto do Drive usada numa arte precisa estar sob as pastas DO PROJETO da
 * arte — para qualquer chamador (pessoa, serviço ou admin). A cópia no Blob
 * fica numa chave por projeto que não sai do id do Drive.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { blobPut, drive, zerarArvore } from '@/lib/google-drive/__tests__/arvore-falsa'

const m = vi.hoisted(() => ({ baixado: [] as string[] }))

vi.mock('@/server/google-drive-service', async () => ({
  googleDriveService: (await import('@/lib/google-drive/__tests__/arvore-falsa')).drive,
}))
vi.mock('@/lib/db', async () => ({ db: (await import('@/lib/google-drive/__tests__/arvore-falsa')).dbFalso }))
vi.mock('@/lib/admin-utils', () => ({ isAdmin: async () => true }))
vi.mock('@vercel/blob', async () => ({ put: (await import('@/lib/google-drive/__tests__/arvore-falsa')).blobPut, del: vi.fn() }))
vi.mock('@/lib/posts/register-project-fonts', () => ({
  fetchBuffer: async (url: string) => {
    m.baixado.push(url)
    return Buffer.from('jpg')
  },
  registerProjectFonts: vi.fn(),
}))

import { resolveImageUrl, lerImagemDeEntrada, persistirCacheDoDrive } from '../persist'
import { carregarFotoParaMedir } from '@/lib/compositor/foto-para-medir'

beforeEach(() => {
  zerarArvore()
  m.baixado = []
  vi.spyOn(console, 'warn').mockImplementation(() => undefined)
  vi.spyOn(console, 'error').mockImplementation(() => undefined)
})

describe('resolveImageUrl', () => {
  it('foto do projeto: copia para uma chave do projeto que não contém o id do Drive', async () => {
    const r = await resolveImageUrl(undefined, 'fileA', 1)
    expect(r.url).toBeTruthy()
    const chave = blobPut.mock.calls[0][0] as string
    expect(chave).toMatch(/^drive-cache\/1\/[0-9a-f]{64}-s1920\.jpg$/)
    expect(chave).not.toContain('fileA')
    // determinística por projeto (a mesma foto reusa o blob); outro projeto, outra chave
    await resolveImageUrl(undefined, 'fileA', 1)
    expect(blobPut.mock.calls[1][0]).toBe(chave)
  })
  it('atalho na pasta do projeto: copia o destino', async () => {
    await resolveImageUrl(undefined, 'shortOk', 1)
    expect(drive.getFileMetadata).toHaveBeenCalledWith('fileAimg', 'thumbnailLink')
    expect(m.baixado).toEqual(['https://lh3.example/miniatura-fileAimg=s1920'])
  })
  it.each([
    [undefined, 'fileB'],
    [undefined, 'shortA'],
    [undefined, 'nao-existe'],
    [undefined, 'root'],
    ['https://studio.example/api/google-drive/image/fileB', undefined],
    ['/api/drive/thumbnail/fileB?size=400', undefined],
    ['https://lh3.googleusercontent.com/d/fileB=w1000', undefined],
    ['https://drive.google.com/uc?export=view&id=fileB', undefined],
  ])('foto fora do projeto (url %s, drive %s): 404, nada baixado nem publicado', async (url, id) => {
    await expect(resolveImageUrl(url, id, 1)).rejects.toMatchObject({ code: 'FOTO_NAO_ENCONTRADA', status: 404 })
    expect(m.baixado).toEqual([])
    expect(blobPut).not.toHaveBeenCalled()
  })
  it('URL do Drive da foto do projeto segue como veio; URL que não é do Drive nem consulta o Drive', async () => {
    expect(await resolveImageUrl('https://studio.example/api/google-drive/image/fileA', undefined, 1)).toEqual({
      url: 'https://studio.example/api/google-drive/image/fileA',
    })
    drive.getFileMetadata.mockClear()
    const blob = 'https://loja.public.blob.vercel-storage.com/x.jpg'
    expect(await resolveImageUrl(blob, undefined, 2)).toEqual({ url: blob })
    expect(drive.getFileMetadata).not.toHaveBeenCalled()
  })
})

describe('carregarFotoParaMedir (medir-copy)', () => {
  it('foto do projeto: lê a miniatura (sem publicar)', async () => {
    await carregarFotoParaMedir({ projectId: 1, foto: { driveFileId: 'fileA' } })
    expect(m.baixado).toEqual(['https://lh3.example/miniatura-fileA=s1920'])
    expect(blobPut).not.toHaveBeenCalled()
  })
  it.each([{ driveFileId: 'fileB' }, { url: 'https://lh3.googleusercontent.com/d/fileB=w100' }])(
    'foto de outro projeto (%j): 404, nada lido',
    async (foto) => {
      await expect(carregarFotoParaMedir({ projectId: 1, foto })).rejects.toMatchObject({ status: 404 })
      expect(m.baixado).toEqual([])
    },
  )
})

describe('CP4.2b — ler × persistir separados', () => {
  it('lerImagemDeEntrada baixa a miniatura e NÃO faz put; persistirCacheDoDrive faz o put na mesma chave determinística; a composição é o resolveImageUrl de sempre', async () => {
    const lida = await lerImagemDeEntrada(undefined, 'fileA', 1)
    expect(lida.url).toBeNull()
    expect(lida.drive).toMatchObject({ projectId: 1, chave: expect.stringMatching(/^[0-9a-f]{64}$/) })
    expect(m.baixado).toHaveLength(1)
    expect(blobPut).not.toHaveBeenCalled()
    const r = await persistirCacheDoDrive(lida)
    expect(blobPut).toHaveBeenCalledTimes(1)
    expect(blobPut.mock.calls[0][0]).toBe(`drive-cache/1/${lida.drive!.chave}-s1920.jpg`)
    expect(r.url).toBeTruthy()
    const direto = await lerImagemDeEntrada('https://cdn.example/foto.jpg', undefined, 1)
    expect(direto).toEqual({ url: 'https://cdn.example/foto.jpg' })
    expect(await persistirCacheDoDrive(direto)).toEqual({ url: 'https://cdn.example/foto.jpg' })
  })
  it('a autorização por projeto continua na leitura: foto fora das pastas do projeto é 404 antes de baixar qualquer coisa', async () => {
    await expect(lerImagemDeEntrada(undefined, 'fileA', 2)).rejects.toMatchObject({ status: 404 })
    expect(m.baixado).toHaveLength(0)
    expect(blobPut).not.toHaveBeenCalled()
  })
})
