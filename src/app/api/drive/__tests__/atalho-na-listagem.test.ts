/**
 * Listagens do Drive: atalho só aparece se o DESTINO também estiver no escopo
 * de quem lista. A pasta listada é conferida, mas os filhos vêm do Drive — e
 * um atalho numa pasta permitida apontando para fora entregaria o id e o tipo
 * do destino. Admin segue com o Drive inteiro, sem filtro.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ARVORE, chamadasDeDados, drive, zerarArvore } from '@/lib/google-drive/__tests__/arvore-falsa'

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
vi.mock('@/lib/mcp/tools', async () => ({
  projetosVisiveis: async (p: { userId: string }) => (await import('@/lib/google-drive/__tests__/arvore-falsa')).VISIVEIS[p.userId] ?? [],
}))
vi.mock('@/lib/projects/access', async () => {
  const f = await import('@/lib/google-drive/__tests__/arvore-falsa')
  return {
    fetchProjectWithShares: async (id: number) => (f.PROJETOS[id] ? { id, ...f.PROJETOS[id] } : null),
    hasProjectReadAccess: (p: { id: number }, { userId }: { userId: string }) =>
      f.ADMINS.has(userId) || (f.VISIVEIS[userId] ?? []).includes(p.id),
  }
})
vi.mock('@/lib/rate-limit', () => ({ assertRateLimit: () => undefined, RateLimitError: class extends Error {} }))

import { GET as listarWeb } from '../../google-drive/files/route'
import { GET as listarDoProjeto } from '../list/route'
import { GET as baixarPasta } from '../folders/download/route'
import { GET as imagensDoProjeto } from '../../projects/[projectId]/google-drive/images/route'

beforeEach(() => {
  zerarArvore()
  m.userId = 'userA'
  vi.spyOn(console, 'warn').mockImplementation(() => undefined)
  vi.spyOn(console, 'error').mockImplementation(() => undefined)
})

async function corpo(r: Response) {
  const body = await r.json()
  return { status: r.status, body, texto: JSON.stringify(body) }
}

const ids = (itens: Array<{ id: string }>) => itens.map((i) => i.id)

// childA tem shortA (→ fileB, fora), shortOk (→ fileAimg, dentro), shortChain
// (→ atalho) e shortLixo (→ lixeira). rootB tem shortB (→ fileA, fora da B).
const ROTAS: Array<[string, (pasta: string) => Promise<Response>, (body: Record<string, unknown>) => Array<{ id: string }>]> = [
  ['google-drive/files', (pasta) => listarWeb(new Request(`http://t/x?folderId=${pasta}&mode=both`)), (b) => b.items as Array<{ id: string }>],
  ['drive/list', (pasta) => listarDoProjeto(new Request(`http://t/x?projectId=1&folderId=${pasta}`)), (b) => b.items as Array<{ id: string }>],
  [
    'drive/folders/download',
    (pasta) => baixarPasta(new Request(`http://t/x?projectId=1&folderId=${pasta}`)),
    (b) => b.files as Array<{ id: string }>,
  ],
]

describe.each(ROTAS)('%s', (_nome, listar, itensDe) => {
  it('não admin: atalho para fora some (nem o id do destino aparece); atalho para dentro fica', async () => {
    const r = await corpo(await listar('childA'))
    expect(r.status).toBe(200)
    expect(ids(itensDe(r.body))).toContain('shortOk')
    for (const fora of ['shortA', 'fileB', 'shortChain', 'shortLixo', 'trashedA']) expect(r.texto).not.toContain(fora)
    // filtrar só lê metadados: a única leitura de dados é a própria listagem
    expect(chamadasDeDados()).toBe(1)
  })
  it('admin: Drive inteiro, sem filtro', async () => {
    m.userId = 'user_admin'
    const r = await corpo(await listar('childA'))
    expect(ids(itensDe(r.body))).toEqual(expect.arrayContaining(['shortA', 'shortOk']))
  })
})

describe('casos de cada listagem', () => {
  it('google-drive/files: o cache guarda a lista JÁ filtrada', async () => {
    await listarWeb(new Request('http://t/x?folderId=childA&mode=images'))
    const r = await listarWeb(new Request('http://t/x?folderId=childA&mode=images'))
    expect(r.headers.get('X-Drive-Cache')).toBe('HIT')
    const c = await corpo(r)
    expect(ids(c.body.items)).toContain('shortOk')
    expect(c.texto).not.toMatch(/shortA|fileB/)
    expect(drive.listFiles).toHaveBeenCalledTimes(1)
  })
  it('google-drive/files: userB na rootB não vê o atalho para a foto da A', async () => {
    m.userId = 'userB'
    const r = await corpo(await listarWeb(new Request('http://t/x?folderId=rootB&mode=both')))
    expect(ids(r.body.items)).toContain('fileB')
    expect(r.texto).not.toMatch(/shortB|fileA/)
  })
  it('drive/folders/download com fileIds: atalho para fora não vira URL; para dentro, a URL é do destino', async () => {
    const fora = await corpo(await baixarPasta(new Request('http://t/x?projectId=1&folderId=childA&fileIds=shortA')))
    expect(fora.status).toBe(404)
    expect(fora.texto).not.toContain('fileB')
    const dentro = await corpo(await baixarPasta(new Request('http://t/x?projectId=1&folderId=childA&fileIds=shortOk')))
    expect(dentro.status).toBe(200)
    expect(dentro.body.files.map((f: { url: string }) => f.url)).toEqual([expect.stringContaining('fileAimg')])
  })
})

describe('projects/[projectId]/google-drive/images', () => {
  const imagens = (projectId: number) =>
    imagensDoProjeto(new Request('http://t/x'), { params: Promise.resolve({ projectId: String(projectId) }) })

  it('não admin: o atalho da rootB para a foto da A some, e a paginação conta só o que ficou', async () => {
    m.userId = 'userB'
    const r = await corpo(await imagens(2))
    expect(r.status).toBe(200)
    expect(ids(r.body.images)).toContain('fileB')
    expect(r.texto).not.toMatch(/shortB|fileA/)
    expect(chamadasDeDados()).toBe(1)
  })
  it('admin: sem filtro', async () => {
    m.userId = 'user_admin'
    const r = await corpo(await imagens(2))
    expect(ids(r.body.images)).toContain('shortB')
  })
})

/**
 * O cache guarda a listagem, nunca a decisão: o atalho é reconferido em toda
 * resposta, inclusive na que sai do cache.
 */
describe('cache não dispensa a conferência do atalho', () => {
  async function comDestinoMovido<T>(id: string, fn: () => Promise<T>) {
    const original = ARVORE[id].parents
    ARVORE[id].parents = ['rootB']
    try {
      return await fn()
    } finally {
      ARVORE[id].parents = original
    }
  }

  it.each([
    ['google-drive/files', 'shortOk', 'fileAimg', () => listarWeb(new Request('http://t/x?folderId=childA&mode=videos')), 'items'],
    ['drive/list', 'shortOk', 'fileAimg', () => listarDoProjeto(new Request('http://t/x?projectId=1&folderId=childA&type=videos')), 'items'],
    [
      'projects/[id]/google-drive/images',
      'shortImg',
      'fileA',
      () => imagensDoProjeto(new Request('http://t/x?limit=7'), { params: Promise.resolve({ projectId: '1' }) }),
      'images',
    ],
  ] as const)('%s: destino que sai do escopo some mesmo com o cache quente', async (_nome, atalho, destino, chamar, campo) => {
    const antes = await corpo(await chamar())
    expect(ids(antes.body[campo])).toContain(atalho)

    const depois = await comDestinoMovido(destino, async () => {
      const r = await chamar()
      expect(r.headers.get('X-Drive-Cache')).toBe('HIT')
      return corpo(r)
    })
    expect(drive.listFiles).toHaveBeenCalledTimes(1)
    expect(depois.texto).not.toContain(atalho)
    expect(ids(depois.body[campo]).length).toBeGreaterThan(0)
  })
})

describe('projects/[id]/google-drive/images: paginação depois da reconferência', () => {
  const pagina = (offset: number) =>
    imagensDoProjeto(new Request(`http://t/x?offset=${offset}&limit=20`), { params: Promise.resolve({ projectId: '1' }) })

  it('atalho que sai do escopo não empurra imagem válida para fora das duas páginas', async () => {
    m.userId = 'userAB'
    const fotos = Array.from({ length: 20 }, (_, i) => ({ id: `foto${i}`, name: `foto${i}`, mimeType: 'image/jpeg', kind: 'file' as const }))
    const atalho = { id: 'shortImg', name: 'atalho', mimeType: 'image/jpeg', kind: 'file' as const, shortcutDetails: { targetId: 'fileA', targetMimeType: 'image/jpeg' } }
    drive.listFiles.mockResolvedValueOnce({ items: [...fotos.slice(0, 5), atalho, ...fotos.slice(5)] })

    const antes = await corpo(await pagina(0))
    expect(ids(antes.body.images)).toContain('shortImg')
    expect(antes.body.nextOffset).toBe(20)

    const original = ARVORE.fileA.parents
    ARVORE.fileA.parents = ['rootB']
    try {
      const p1 = await corpo(await pagina(0))
      const p2 = await corpo(await pagina(20))
      const vistas = [...ids(p1.body.images), ...ids(p2.body.images)]
      expect(vistas).toEqual(fotos.map((f) => f.id))
      expect(p1.body.nextOffset).toBeUndefined()
      expect(p2.body.nextOffset).toBeUndefined()
    } finally {
      ARVORE.fileA.parents = original
    }
    expect(drive.listFiles).toHaveBeenCalledTimes(1)
  })
})
