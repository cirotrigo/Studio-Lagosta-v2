/**
 * Rotas web do Drive sem projeto: admin vê o Drive inteiro; os demais, só o
 * que está sob as pastas dos projetos que enxergam. "Não é seu" e "não existe"
 * respondem igual, e a recusa não chega a ler dado nenhum do Drive.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { blobPut, chamadasDeDados, drive, zerarArvore } from '@/lib/google-drive/__tests__/arvore-falsa'

const m = vi.hoisted(() => ({ userId: 'userA' as string | null }))

vi.mock('@clerk/nextjs/server', () => ({ auth: async () => ({ userId: m.userId, orgId: null }), currentUser: async () => null }))
vi.mock('@/server/google-drive-service', async () => ({
  googleDriveService: (await import('@/lib/google-drive/__tests__/arvore-falsa')).drive,
}))
vi.mock('@/lib/db', async () => ({ db: (await import('@/lib/google-drive/__tests__/arvore-falsa')).dbFalso }))
vi.mock('@/lib/admin-utils', async () => ({
  isAdmin: async (id: string) => (await import('@/lib/google-drive/__tests__/arvore-falsa')).ADMINS.has(id),
}))
vi.mock('@/lib/mcp/tools', async () => ({
  projetosVisiveis: async (p: { userId: string }) => (await import('@/lib/google-drive/__tests__/arvore-falsa')).VISIVEIS[p.userId] ?? [],
}))
vi.mock('@/lib/auth-utils', () => ({ getUserFromClerkId: async () => ({ id: 'u-int' }) }))
vi.mock('@vercel/blob', async () => ({ put: (await import('@/lib/google-drive/__tests__/arvore-falsa')).blobPut }))
vi.mock('@/lib/rate-limit', () => ({ assertRateLimit: () => undefined, RateLimitError: class extends Error {} }))

import { GET as listar } from '../files/route'
import { GET as imagem } from '../image/[fileId]/route'
import { GET as miniatura } from '../thumbnail/[fileId]/route'
import { GET as miniaturaAntiga } from '../../drive/thumbnail/[fileId]/route'
import { POST as copiarParaBlob } from '../../upload/google-drive/route'
import { POST as enviarAoDrive } from '../../drive/upload-image/route'

const fetchOriginal = globalThis.fetch
const fetchFalso = vi.fn(async () => new Response(Buffer.from('png'), { headers: { 'content-type': 'image/png' } }))

beforeEach(() => {
  zerarArvore()
  m.userId = 'userA'
  vi.spyOn(console, 'warn').mockImplementation(() => undefined)
  vi.spyOn(console, 'error').mockImplementation(() => undefined)
  globalThis.fetch = fetchFalso as unknown as typeof fetch
  vi.stubEnv('BLOB_READ_WRITE_TOKEN', 'token-de-teste')
  return () => {
    globalThis.fetch = fetchOriginal
  }
})

const lista = (qs = '') => listar(new Request(`http://t/api/google-drive/files${qs}`))
const comId = (rota: typeof imagem, id: string) => rota(new Request('http://t/x'), { params: Promise.resolve({ fileId: id }) })
const blob = (fileId: unknown) =>
  copiarParaBlob(new Request('http://t/api/upload/google-drive', { method: 'POST', body: JSON.stringify({ fileId }) }))
const upload = (folderId: unknown, imageUrl = 'https://loja.public.blob.vercel-storage.com/ia.png') =>
  enviarAoDrive(
    new Request('http://t/api/drive/upload-image', { method: 'POST', body: JSON.stringify({ imageUrl, folderId, fileName: 'ia' }) }),
  )

async function corpo(r: Response) {
  return { status: r.status, body: await r.json() }
}

const ADVERSARIOS = ['../rootB', '%2e%2e%2frootB', 'root', '', ' rootB', 'a'.repeat(10_000), 'rootA\u0000', "x' in parents or 'rootB"].map(
  (id) => [JSON.stringify(id.slice(0, 30)), id] as const,
)

describe('GET /api/google-drive/files', () => {
  it('admin: a raiz é o Drive inteiro', async () => {
    m.userId = 'user_admin'
    expect((await lista()).status).toBe(200)
    expect(drive.listFiles).toHaveBeenCalledWith(expect.objectContaining({ folderId: undefined }))
  })
  it('não admin sem pasta: só as próprias raízes, com os nomes do banco, sem ir ao Drive', async () => {
    const r = await corpo(await lista('?mode=images'))
    expect(r.status).toBe(200)
    expect(r.body.items.map((i: { id: string; name: string; kind: string }) => [i.id, i.name, i.kind])).toEqual([
      ['rootA', 'Cliente A', 'folder'],
      ['rootAimg', 'Imagens A', 'folder'],
    ])
    expect(chamadasDeDados()).toBe(0)
    expect(drive.getFileMetadata).not.toHaveBeenCalled()
  })
  it('busca sem pasta não varre o Drive: filtra as raízes', async () => {
    const r = await corpo(await lista('?search=imagens'))
    expect(r.body.items.map((i: { id: string }) => i.id)).toEqual(['rootAimg'])
    expect(chamadasDeDados()).toBe(0)
  })
  it('userA lista raiz e subpasta da A; pasta da B responde igual a pasta inexistente, sem listar', async () => {
    expect((await lista('?folderId=rootA')).status).toBe(200)
    expect((await lista('?folderId=childA&search=x')).status).toBe(200)
    expect(drive.listFiles).toHaveBeenLastCalledWith(expect.objectContaining({ folderId: 'childA', search: 'x' }))
    drive.listFiles.mockClear()
    const alheia = await corpo(await lista('?folderId=rootB'))
    const inexistente = await corpo(await lista('?folderId=nao-existe'))
    expect(alheia.status).toBe(404)
    expect(alheia).toEqual(inexistente)
    expect(drive.listFiles).not.toHaveBeenCalled()
  })
  it('userAB lista as duas; userNone não vê nada e o Drive não é consultado', async () => {
    m.userId = 'userAB'
    expect((await lista('?folderId=rootB')).status).toBe(200)
    expect((await lista('?folderId=childA')).status).toBe(200)
    m.userId = 'userNone'
    zerarArvore()
    expect((await corpo(await lista())).body.items).toEqual([])
    expect((await lista('?folderId=rootA')).status).toBe(404)
    expect(drive.getFileMetadata).not.toHaveBeenCalled()
    expect(chamadasDeDados()).toBe(0)
  })
  it('parâmetro repetido: lista exatamente a pasta conferida', async () => {
    expect((await lista('?folderId=childA&folderId=rootB&mode=both')).status).toBe(200)
    expect(drive.listFiles).toHaveBeenCalledTimes(1)
    expect(drive.listFiles).toHaveBeenCalledWith(expect.objectContaining({ folderId: 'childA' }))
  })
  it.each(ADVERSARIOS.filter(([, id]) => id))('folderId adversário %s: recusado sem tocar o Drive', async (_r, id) => {
    const r = await lista(`?folderId=${encodeURIComponent(id)}`)
    expect(r.status).toBe(404)
    expect(drive.getFileMetadata).not.toHaveBeenCalled()
    expect(chamadasDeDados()).toBe(0)
  })
  it('o cache de um admin não serve a outra pessoa', async () => {
    m.userId = 'user_admin'
    await lista('?folderId=rootB')
    m.userId = 'userA'
    drive.listFiles.mockClear()
    expect((await lista('?folderId=rootB')).status).toBe(404)
    expect(drive.listFiles).not.toHaveBeenCalled()
  })
})

describe.each([
  ['image', imagem, drive.getFileStream],
  ['thumbnail', miniatura, drive.getThumbnailStream],
  ['drive/thumbnail', miniaturaAntiga, drive.getThumbnailStream],
] as const)('GET %s/[fileId]', (_nome, rota, leitura) => {
  it('userA lê a foto da A (e o destino do atalho); admin lê qualquer uma', async () => {
    expect((await comId(rota, 'fileA')).status).toBe(200)
    expect(leitura).toHaveBeenLastCalledWith('fileA', ...(leitura === drive.getFileStream ? [undefined] : [400]))
    expect((await comId(rota, 'shortOk')).status).toBe(200)
    expect(leitura.mock.lastCall?.[0]).toBe('fileAimg')
    // atalho na A para foto da B: recusado
    expect((await comId(rota, 'shortA')).status).toBe(404)
    m.userId = 'user_admin'
    expect((await comId(rota, 'fileB')).status).toBe(200)
  })
  it('foto da B, inexistente, com erro do Drive e na lixeira: o mesmo 404, sem detalhe e sem ler bytes', async () => {
    const respostas = await Promise.all(['fileB', 'nao-existe', 'boom', 'trashedA', 'orphan'].map(async (id) => corpo(await comId(rota, id))))
    for (const r of respostas) expect(r).toEqual(respostas[0])
    expect(respostas[0].status).toBe(404)
    expect(JSON.stringify(respostas[0].body)).not.toMatch(/details|segredo|not found/i)
    expect(leitura).not.toHaveBeenCalled()
  })
  it('userAB lê as duas; userNone nada, sem consultar o Drive', async () => {
    m.userId = 'userAB'
    expect((await comId(rota, 'fileB')).status).toBe(200)
    m.userId = 'userNone'
    zerarArvore()
    expect((await comId(rota, 'fileA')).status).toBe(404)
    expect(drive.getFileMetadata).not.toHaveBeenCalled()
  })
  it.each(ADVERSARIOS)('id adversário %s: recusado sem tocar o Drive', async (_r, id) => {
    expect([400, 404]).toContain((await comId(rota, id)).status)
    expect(drive.getFileMetadata).not.toHaveBeenCalled()
    expect(leitura).not.toHaveBeenCalled()
  })
})

describe('POST /api/upload/google-drive (cópia para o Blob)', () => {
  it('userA copia a foto da A', async () => {
    expect((await blob('fileA')).status).toBe(200)
    expect(drive.getFileStream).toHaveBeenCalledWith('fileA')
    expect(blobPut).toHaveBeenCalledTimes(1)
  })
  it('foto da B e inexistente: o mesmo 404, nada lido e nada publicado', async () => {
    const alheia = await corpo(await blob('fileB'))
    const inexistente = await corpo(await blob('nao-existe'))
    expect(alheia.status).toBe(404)
    expect(alheia).toEqual(inexistente)
    expect(drive.getFileStream).not.toHaveBeenCalled()
    expect(blobPut).not.toHaveBeenCalled()
  })
  it.each(ADVERSARIOS)('id adversário %s: recusado sem Drive e sem Blob', async (_r, id) => {
    expect([400, 404]).toContain((await blob(id)).status)
    expect(drive.getFileMetadata).not.toHaveBeenCalled()
    expect(blobPut).not.toHaveBeenCalled()
  })
  it('erro do Drive depois de permitido não vaza a mensagem', async () => {
    drive.getFileStream.mockRejectedValueOnce(new Error('segredo do Drive'))
    const r = await corpo(await blob('fileA'))
    expect(JSON.stringify(r.body)).not.toMatch(/segredo/)
  })
})

describe('POST /api/drive/upload-image', () => {
  it('userA envia para a pasta da A; admin para qualquer uma', async () => {
    expect((await upload('childA')).status).toBe(200)
    expect(drive.uploadFileToFolder).toHaveBeenCalledWith(expect.objectContaining({ folderId: 'childA' }))
    m.userId = 'user_admin'
    expect((await upload('rootB')).status).toBe(200)
  })
  it('pasta da B e inexistente: o mesmo 404, sem baixar a imagem e sem enviar', async () => {
    const alheia = await corpo(await upload('rootB'))
    const inexistente = await corpo(await upload('nao-existe'))
    expect(alheia.status).toBe(404)
    expect(alheia).toEqual(inexistente)
    expect(fetchFalso).not.toHaveBeenCalled()
    expect(drive.uploadFileToFolder).not.toHaveBeenCalled()
  })
  it('atalho como destino não vale (escrita só em pasta de verdade)', async () => {
    expect((await upload('shortOk')).status).toBe(404)
    expect(drive.uploadFileToFolder).not.toHaveBeenCalled()
  })
  it.each([
    'http://loja.public.blob.vercel-storage.com/ia.png',
    'https://evil.example/ia.png',
    'https://evil.example/?x=.public.blob.vercel-storage.com/',
    'https://169.254.169.254/latest/meta-data',
    'file:///etc/passwd',
  ])('imageUrl fora do Blob (%s): recusada sem baixar', async (url) => {
    m.userId = 'user_admin'
    expect((await upload('rootA', url)).status).toBe(400)
    expect(fetchFalso).not.toHaveBeenCalled()
    expect(drive.uploadFileToFolder).not.toHaveBeenCalled()
  })
  it.each(ADVERSARIOS)('folderId adversário %s: recusado sem Drive', async (_r, id) => {
    expect([400, 404]).toContain((await upload(id)).status)
    expect(drive.getFileMetadata).not.toHaveBeenCalled()
    expect(fetchFalso).not.toHaveBeenCalled()
  })
})
