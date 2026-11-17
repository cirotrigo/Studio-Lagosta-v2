import { beforeEach, describe, expect, it, vi } from 'vitest'

const ordem = vi.hoisted(() => [] as string[])
const del = vi.hoisted(() => vi.fn(async (alvo: string) => void ordem.push(`blob:${alvo}`)))
const deleteFiles = vi.hoisted(() => vi.fn(async (ids: string[]) => void ordem.push(`drive:${ids.join(',')}`)))
const banco = vi.hoisted(() => ({
  generation: {
    delete: vi.fn(async (q: { where: { id: string } }) => void ordem.push(`linha:${q.where.id}`)),
    count: vi.fn(async (_q: unknown) => 0),
  },
  page: {
    findFirst: vi.fn(async (_q: unknown): Promise<{ name: string; thumbnail: string | null } | null> => null),
    delete: vi.fn(async (q: { where: { id: string } }) => void ordem.push(`pagina:${q.where.id}`)),
    updateMany: vi.fn(async (_q: unknown) => void ordem.push('reordena')),
  },
  socialPost: { count: vi.fn(async (_q: unknown) => 0) },
}))

vi.mock('@vercel/blob', () => ({ del }))
vi.mock('@/lib/db', () => ({ db: banco }))
vi.mock('@/server/google-drive-service', () => ({ googleDriveService: { isEnabled: () => true, deleteFiles } }))
// O módulo real carrega a limpeza de 90 dias inteira; aqui só interessa a regra da URL.
vi.mock('@/lib/cleanup/blob-cleanup', () => ({
  extractBlobPathname: (url: string | null) =>
    url && url.includes('blob.vercel-storage.com') ? new URL(url).pathname.replace(/^\//, '') : null,
}))

import { apagarArquivosELinhaDaArte, apagarPaginaEReordenar, modoDoBlob } from '../galeria'

/**
 * A exclusão compartilhada entre as rotas do app (`DELETE /api/generations/[id]`, `bulk-delete`) e `apagar-arte`:
 * Drive, blob, linha, nessa ordem; QUAL blob sai; e quando ele fica.
 */

const URL_DA_ARTE = 'https://x.public.blob.vercel-storage.com/arte-rapida/7/pg1-1.png'
// `fileName` de peça composta é o nome da página: a função nem o recebe mais.
const composta = { id: 'gen1', projectId: 7, resultUrl: URL_DA_ARTE, googleDriveFileId: 'drive1' }

beforeEach(() => {
  ordem.length = 0
  vi.clearAllMocks()
  banco.generation.count.mockResolvedValue(0)
  banco.socialPost.count.mockResolvedValue(0)
  banco.page.findFirst.mockResolvedValue(null)
})

describe('apagarArquivosELinhaDaArte', () => {
  it("'imagem': apaga o Drive, o blob da IMAGEM (pelo resultUrl) e a linha por último", async () => {
    expect(await apagarArquivosELinhaDaArte(composta, 'imagem')).toEqual({ drive: 'na-lixeira', blob: 'apagado' })
    expect(ordem).toEqual(['drive:drive1', `blob:${URL_DA_ARTE}`, 'linha:gen1'])
  })

  it("'imagem' com a arte fora do Blob (link do Drive): nenhum blob é tocado", async () => {
    const r = await apagarArquivosELinhaDaArte({ ...composta, resultUrl: 'https://lh3.googleusercontent.com/d/abc' }, 'imagem')
    expect(r).toEqual({ drive: 'na-lixeira', blob: 'nao-havia' })
    expect(del).not.toHaveBeenCalled()
    expect(banco.generation.delete).toHaveBeenCalledTimes(1)
  })

  it("'manter': o blob fica e a linha sai", async () => {
    const r = await apagarArquivosELinhaDaArte({ ...composta, googleDriveFileId: null }, 'manter')
    expect(r).toEqual({ drive: 'nao-havia', blob: 'mantido' })
    expect(ordem).toEqual(['linha:gen1'])
  })

  it('falha no Drive ou no Blob vira aviso e a linha sai mesmo assim', async () => {
    deleteFiles.mockRejectedValueOnce(new Error('drive fora'))
    del.mockRejectedValueOnce(new Error('blob fora'))
    const aviso = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const r = await apagarArquivosELinhaDaArte(composta, 'imagem')
    aviso.mockRestore()
    expect(r).toEqual({ drive: 'falhou', blob: 'falhou' })
    expect(banco.generation.delete).toHaveBeenCalledWith({ where: { id: 'gen1' } })
  })
})

describe('modoDoBlob: o que as rotas do app perguntam antes de apagar', () => {
  it('ninguém usa a imagem: sai', async () => {
    expect(await modoDoBlob(composta)).toBe('imagem')
  })

  it('é a miniatura de uma página do cliente: fica', async () => {
    banco.page.findFirst.mockResolvedValueOnce({ name: 'Story teste', thumbnail: URL_DA_ARTE })
    expect(await modoDoBlob(composta)).toBe('manter')
    expect(banco.page.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { thumbnail: URL_DA_ARTE, Template: { projectId: 7 } } }),
    )
  })

  it('é a mídia de um post da agenda: fica', async () => {
    banco.socialPost.count.mockResolvedValueOnce(1)
    expect(await modoDoBlob(composta)).toBe('manter')
  })

  it('outra arte usa o arquivo: fica; mas arte do MESMO lote não segura', async () => {
    banco.generation.count.mockResolvedValueOnce(1)
    expect(await modoDoBlob(composta)).toBe('manter')
    await modoDoBlob(composta, ['gen2', 'gen3'])
    expect(banco.generation.count).toHaveBeenLastCalledWith({
      where: { projectId: 7, resultUrl: URL_DA_ARTE, id: { notIn: ['gen1', 'gen2', 'gen3'] } },
    })
  })

  it('arte sem imagem: nada a consultar', async () => {
    expect(await modoDoBlob({ ...composta, resultUrl: null })).toBe('imagem')
    expect(banco.page.findFirst).not.toHaveBeenCalled()
  })
})

describe('apagarPaginaEReordenar', () => {
  it('apaga a página e fecha o buraco na ordem da pasta', async () => {
    await apagarPaginaEReordenar({ id: 'pg1', templateId: 570, order: 3 })
    expect(ordem).toEqual(['pagina:pg1', 'reordena'])
    expect(banco.page.updateMany).toHaveBeenCalledWith({
      where: { templateId: 570, order: { gt: 3 } },
      data: { order: { decrement: 1 } },
    })
  })
})
