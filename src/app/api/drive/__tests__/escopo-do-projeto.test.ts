/**
 * Rotas do Drive com projeto: todo id que vem do cliente precisa estar sob as
 * pastas DAQUELE projeto (admin: Drive inteiro). Projeto inexistente, sem
 * acesso e pasta alheia respondem o mesmo 404, e nada é lido ou escrito.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { chamadasDeDados, drive, zerarArvore } from '@/lib/google-drive/__tests__/arvore-falsa'

const m = vi.hoisted(() => ({ userId: 'userA' }))

vi.mock('@clerk/nextjs/server', () => ({ auth: async () => ({ userId: m.userId, orgId: null }), currentUser: async () => null }))
vi.mock('@/server/google-drive-service', async () => ({
  googleDriveService: (await import('@/lib/google-drive/__tests__/arvore-falsa')).drive,
}))
vi.mock('@/lib/db', async () => ({ db: (await import('@/lib/google-drive/__tests__/arvore-falsa')).dbFalso }))
vi.mock('@/lib/permissions', async () => (await import('@/lib/google-drive/__tests__/arvore-falsa')).permissoes)
vi.mock('@/lib/admin-utils', async () => {
  const f = await import('@/lib/google-drive/__tests__/arvore-falsa')
  return { isAdmin: async (id: string) => f.ADMINS.has(id) }
})
vi.mock('@/lib/rate-limit', () => ({ assertRateLimit: () => undefined, RateLimitError: class extends Error {} }))

import { GET as listar } from '../list/route'
import { GET as trilha } from '../breadcrumbs/route'
import { GET as baixarPasta } from '../folders/download/route'
import { POST as criarPasta } from '../folders/create/route'
import { POST as mover } from '../files/move/route'
import { DELETE as apagar } from '../files/delete/route'
import { POST as enviar } from '../files/upload/route'

beforeEach(() => {
  zerarArvore()
  m.userId = 'userA'
  vi.spyOn(console, 'warn').mockImplementation(() => undefined)
  vi.spyOn(console, 'error').mockImplementation(() => undefined)
})

const get = (rota: (r: Request) => Promise<Response>, qs: string) => rota(new Request(`http://t/x?${qs}`))
const json = (rota: (r: Request) => Promise<Response>, body: unknown, method = 'POST') =>
  rota(new Request('http://t/x', { method, body: JSON.stringify(body) }))
const upload = (projectId: number, folderId: string) => {
  const fd = new FormData()
  fd.set('projectId', String(projectId))
  fd.set('folderId', folderId)
  fd.append('files', new File([Buffer.from('x')], 'a.jpg', { type: 'image/jpeg' }))
  return enviar(new Request('http://t/x', { method: 'POST', body: fd }))
}

async function corpo(r: Response) {
  return { status: r.status, body: await r.json() }
}

const pastaDo = (projectId: number) => (projectId === 2 ? 'rootB' : 'childA')

/** Cada rota com: (projeto, pasta/arquivo alvo) → resposta. */
const ROTAS: Array<[string, (projectId: number, id: string) => Promise<Response>]> = [
  ['list', (p, id) => get(listar, `projectId=${p}&folderId=${encodeURIComponent(id)}`)],
  ['breadcrumbs', (p, id) => get(trilha, `projectId=${p}&folderId=${encodeURIComponent(id)}`)],
  ['folders/download (pasta)', (p, id) => get(baixarPasta, `projectId=${p}&folderId=${encodeURIComponent(id)}`)],
  ['folders/download (arquivos)', (p, id) => get(baixarPasta, `projectId=${p}&folderId=${pastaDo(p)}&fileIds=${encodeURIComponent(id)}`)],
  ['folders/create', (p, id) => json(criarPasta, { name: 'Nova', parentId: id, projectId: p })],
  ['files/move (destino)', (p, id) => json(mover, { fileIds: [p === 2 ? 'fileB' : 'fileA'], targetFolderId: id, projectId: p })],
  ['files/move (arquivo)', (p, id) => json(mover, { fileIds: [id], targetFolderId: pastaDo(p), projectId: p })],
  ['files/delete', (p, id) => json(apagar, { fileIds: [id], projectId: p }, 'DELETE')],
  ['files/upload', (p, id) => upload(p, id)],
]

describe.each(ROTAS)('%s', (_nome, chamar) => {
  const alvoDaA = _nome.includes('arquivo') || _nome === 'files/delete' ? 'fileA' : 'childA'
  const alvoDaB = _nome.includes('arquivo') || _nome === 'files/delete' ? 'fileB' : 'rootB'

  it('userA no projeto 1: o que está sob as pastas dele passa', async () => {
    expect((await chamar(1, alvoDaA)).status).toBe(200)
  })
  it('pasta alheia, projeto inexistente e projeto sem acesso: o mesmo 404, nada lido nem escrito', async () => {
    const alheia = await corpo(await chamar(1, alvoDaB))
    const semProjeto = await corpo(await chamar(99, alvoDaA))
    const semAcesso = await corpo(await chamar(2, alvoDaB))
    const inexistente = await corpo(await chamar(1, 'nao-existe'))
    expect(alheia.status).toBe(404)
    for (const r of [semProjeto, semAcesso, inexistente]) expect(r).toEqual(alheia)
    expect(chamadasDeDados()).toBe(0)
  })
  it('o vínculo é com o PROJETO: quem vê os dois não usa a pasta do 2 no projeto 1', async () => {
    m.userId = 'userAB'
    expect((await chamar(1, alvoDaB)).status).toBe(404)
    expect((await chamar(2, alvoDaB)).status).toBe(200)
  })
  it('admin: Drive inteiro', async () => {
    m.userId = 'user_admin'
    expect((await chamar(1, alvoDaB)).status).toBe(200)
  })
  it.each(['../rootB', '%2e%2e%2frootB', 'root', ' rootB', 'a'.repeat(10_000), "x' in parents or 'rootB"].map((id) => [id.slice(0, 30), id]))(
    'id adversário %j: recusado sem tocar o Drive',
    async (_rotulo, id) => {
      expect([400, 404]).toContain((await chamar(1, id)).status)
      // ' rootB' vira 'rootB' no trim do schema: o valor conferido é o mesmo usado, e é recusado
      if (id !== ' rootB') expect(drive.getFileMetadata).not.toHaveBeenCalled()
      expect(chamadasDeDados()).toBe(0)
    },
  )
})

describe('casos de cada rota', () => {
  it('list: sem pasta, a pasta de imagens do projeto (fora da geral) é usada sem consulta', async () => {
    expect((await get(listar, 'projectId=1')).status).toBe(200)
    expect(drive.listFiles).toHaveBeenCalledWith(expect.objectContaining({ folderId: 'rootAimg' }))
  })
  it('breadcrumbs: para na raiz do projeto e nunca mostra nome acima dela', async () => {
    const r = await corpo(await get(trilha, 'projectId=1&folderId=grandA'))
    expect(r.body.breadcrumbs.map((b: { id: string }) => b.id)).toEqual(['rootA', 'childA', 'grandA'])
    expect(JSON.stringify(r.body)).not.toMatch(/Meu Drive|meu/)
    m.userId = 'user_admin'
    const a = await corpo(await get(trilha, 'projectId=1&folderId=grandA'))
    expect(a.body.breadcrumbs[0].id).toBe('meu')
  })
  it('move, delete e download: tudo ou nada', async () => {
    expect((await json(mover, { fileIds: ['fileA', 'fileB'], targetFolderId: 'childA', projectId: 1 })).status).toBe(404)
    expect((await json(apagar, { fileIds: ['fileA', 'fileB'], projectId: 1 }, 'DELETE')).status).toBe(404)
    expect((await get(baixarPasta, 'projectId=1&folderId=childA&fileIds=fileA&fileIds=fileB')).status).toBe(404)
    expect(chamadasDeDados()).toBe(0)
    expect(drive.moveFiles).not.toHaveBeenCalled()
    expect(drive.deleteFiles).not.toHaveBeenCalled()
  })
  it('move e delete agem sobre o atalho, nunca sobre o destino dele', async () => {
    expect((await json(mover, { fileIds: ['shortOk'], targetFolderId: 'grandA', projectId: 1 })).status).toBe(200)
    expect(drive.moveFiles).toHaveBeenCalledWith(['shortOk'], 'grandA')
    expect((await json(apagar, { fileIds: ['shortOk'], projectId: 1 }, 'DELETE')).status).toBe(200)
    expect(drive.deleteFiles).toHaveBeenCalledWith(['shortOk'])
  })
  it('atalho não vale como destino de escrita', async () => {
    expect((await json(mover, { fileIds: ['fileA'], targetFolderId: 'shortOk', projectId: 1 })).status).toBe(404)
    expect((await json(criarPasta, { name: 'N', parentId: 'shortOk', projectId: 1 })).status).toBe(404)
    expect((await upload(1, 'shortOk')).status).toBe(404)
    expect(chamadasDeDados()).toBe(0)
  })
  it('parâmetro repetido: baixa a pasta conferida', async () => {
    expect((await get(baixarPasta, 'projectId=1&folderId=childA&folderId=rootB')).status).toBe(200)
    expect(drive.listFolderFiles).toHaveBeenCalledWith('childA')
  })
})
