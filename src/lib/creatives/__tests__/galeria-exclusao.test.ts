import { beforeEach, describe, expect, it, vi } from 'vitest'

const ordem = vi.hoisted(() => [] as string[])
const del = vi.hoisted(() => vi.fn(async (alvo: string) => void ordem.push(`blob:${alvo}`)))
const deleteFiles = vi.hoisted(() => vi.fn(async (ids: string[]) => void ordem.push(`drive:${ids.join(',')}`)))
const apagarLinha = vi.hoisted(() => vi.fn(async (q: { where: { id: string } }) => void ordem.push(`linha:${q.where.id}`)))

vi.mock('@vercel/blob', () => ({ del }))
vi.mock('@/lib/db', () => ({ db: { generation: { delete: apagarLinha } } }))
vi.mock('@/server/google-drive-service', () => ({ googleDriveService: { isEnabled: () => true, deleteFiles } }))
// O módulo real carrega a limpeza de 90 dias inteira; aqui só interessa a regra da URL.
vi.mock('@/lib/cleanup/blob-cleanup', () => ({
  extractBlobPathname: (url: string | null) =>
    url && url.includes('blob.vercel-storage.com') ? new URL(url).pathname.replace(/^\//, '') : null,
}))

import { apagarArquivosELinhaDaArte } from '../galeria'

/**
 * A exclusão compartilhada entre `DELETE /api/generations/[id]` e `apagar-arte`: Drive, blob, linha, nessa
 * ordem, e QUAL blob sai em cada modo.
 */

const URL_DA_ARTE = 'https://x.public.blob.vercel-storage.com/arte-rapida/7/pg1-1.png'
const composta = { id: 'gen1', resultUrl: URL_DA_ARTE, fileName: 'Story teste.png', googleDriveFileId: 'drive1' }

beforeEach(() => {
  ordem.length = 0
  del.mockClear()
  deleteFiles.mockClear()
  apagarLinha.mockClear()
})

describe('apagarArquivosELinhaDaArte', () => {
  it('rota (sem opção): a regra de sempre, fileName ?? caminho do resultUrl, e a linha por último', async () => {
    expect(await apagarArquivosELinhaDaArte(composta)).toEqual({ drive: 'apagado', blob: 'apagado' })
    expect(ordem).toEqual(['drive:drive1', 'blob:Story teste.png', 'linha:gen1'])

    ordem.length = 0
    await apagarArquivosELinhaDaArte({ ...composta, fileName: null })
    expect(ordem).toEqual(['drive:drive1', 'blob:arte-rapida/7/pg1-1.png', 'linha:gen1'])
  })

  it("conector ('imagem'): apaga o blob da IMAGEM, não o nome da página", async () => {
    expect(await apagarArquivosELinhaDaArte(composta, { blob: 'imagem' })).toEqual({ drive: 'apagado', blob: 'apagado' })
    expect(ordem).toEqual(['drive:drive1', `blob:${URL_DA_ARTE}`, 'linha:gen1'])
  })

  it("'imagem' com a arte fora do Blob (link do Drive): nenhum blob é tocado", async () => {
    const r = await apagarArquivosELinhaDaArte({ ...composta, resultUrl: 'https://lh3.googleusercontent.com/d/abc' }, { blob: 'imagem' })
    expect(r).toEqual({ drive: 'apagado', blob: 'nao-havia' })
    expect(del).not.toHaveBeenCalled()
    expect(apagarLinha).toHaveBeenCalledTimes(1)
  })

  it("'manter': o blob fica e a linha sai", async () => {
    const r = await apagarArquivosELinhaDaArte({ ...composta, googleDriveFileId: null }, { blob: 'manter' })
    expect(r).toEqual({ drive: 'nao-havia', blob: 'mantido' })
    expect(ordem).toEqual(['linha:gen1'])
  })

  it('falha no Drive ou no Blob vira aviso e a linha sai mesmo assim', async () => {
    deleteFiles.mockRejectedValueOnce(new Error('drive fora'))
    del.mockRejectedValueOnce(new Error('blob fora'))
    const aviso = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const r = await apagarArquivosELinhaDaArte(composta, { blob: 'imagem' })
    aviso.mockRestore()
    expect(r).toEqual({ drive: 'falhou', blob: 'falhou' })
    expect(apagarLinha).toHaveBeenCalledWith({ where: { id: 'gen1' } })
  })
})
