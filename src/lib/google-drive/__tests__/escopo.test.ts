/**
 * Escopo do Drive: a pasta ou arquivo só vale se estiver sob as pastas dos
 * projetos que a pessoa enxerga — e qualquer dúvida é recusa.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { dbFalso, drive, embeddings, zerarArvore } from './arvore-falsa'

vi.mock('@/server/google-drive-service', async () => ({ googleDriveService: (await import('./arvore-falsa')).drive }))
vi.mock('@/lib/db', async () => ({ db: (await import('./arvore-falsa')).dbFalso }))
vi.mock('@/lib/admin-utils', async () => ({
  isAdmin: async (userId: string) => (await import('./arvore-falsa')).ADMINS.has(userId),
}))
vi.mock('@/lib/mcp/tools', async () => ({
  projetosVisiveis: async (p: { kind: string; userId?: string }) =>
    p.kind === 'service' ? null : ((await import('./arvore-falsa')).VISIVEIS[p.userId ?? ''] ?? []),
}))

import {
  assertDriveDoProjeto,
  driveItemPermitido,
  escopoDoDriveWeb,
  idDoDriveValido,
  raizesDoProjeto,
} from '../escopo'

const A = new Set(['rootA', 'rootAimg'])
const B = new Set(['rootB'])

beforeEach(() => {
  zerarArvore()
  vi.spyOn(console, 'warn').mockImplementation(() => undefined)
})

describe('driveItemPermitido', () => {
  it.each([
    ['rootA', 'rootA'],
    ['childA', 'childA'],
    ['fileA', 'fileA'],
    ['rootAimg', 'rootAimg'],
    ['fileAimg', 'fileAimg'],
    ['fundo3', 'fundo3'],
  ])('%s sob as raízes do projeto 1 → permitido', async (id, efetivo) => {
    expect(await driveItemPermitido(id, A)).toEqual({ permitido: true, idEfetivo: efetivo })
  })

  it('atalho vale pela posição DELE e devolve o destino; o destino cru vale pela própria ascendência', async () => {
    expect(await driveItemPermitido('shortA', A)).toEqual({ permitido: true, idEfetivo: 'fileB' })
    expect((await driveItemPermitido('fileB', A)).permitido).toBe(false)
    expect(await driveItemPermitido('shortB', B)).toEqual({ permitido: true, idEfetivo: 'fileA' })
    expect((await driveItemPermitido('shortB', A)).permitido).toBe(false)
    expect((await driveItemPermitido('semDestino', A)).permitido).toBe(false)
  })

  it.each([
    'fileB',
    'rootB',
    'orphan',
    'orphanDeep',
    'X',
    'Z',
    'boom',
    'viaBoom',
    'trashedA',
    'lixeiraA',
    'sobLixeira',
    'multi',
    'fundo11',
    'nao-existe',
    'meu',
  ])('%s → recusado', async (id) => {
    const r = await driveItemPermitido(id, A)
    expect(r.permitido).toBe(false)
  })

  it('a recusa não carrega nada do Drive (mensagem, nome, pais)', async () => {
    const recusas = await Promise.all(['boom', 'fileB', 'nao-existe', 'orphan'].map((id) => driveItemPermitido(id, A)))
    for (const r of recusas) {
      expect(Object.keys(r).sort()).toEqual(['motivo', 'permitido'])
      expect(JSON.stringify(r)).not.toMatch(/segredo|rootB|File not found|Cliente/)
    }
  })

  it.each([
    ['root'],
    [''],
    ['   '],
    [' rootA'],
    ['../rootB'],
    ['%2e%2e%2frootB'],
    ["x' in parents or 'rootB"],
    ['rootA\u0000'],
    ['a'.repeat(201)],
    ['a'.repeat(10_000)],
  ])('id adversário %j → recusado sem tocar o Drive', async (id) => {
    expect(idDoDriveValido(id)).toBe(false)
    expect((await driveItemPermitido(id, A)).permitido).toBe(false)
    expect(drive.getFileMetadata).not.toHaveBeenCalled()
  })

  it("'root' nunca vale como raiz; sem raízes nada é consultado", async () => {
    expect((await driveItemPermitido('rootA', new Set(['root']))).permitido).toBe(false)
    expect((await driveItemPermitido('fileA', new Set())).permitido).toBe(false)
    expect(drive.getFileMetadata).not.toHaveBeenCalled()
  })

  it('ciclo e profundidade terminam com um número limitado de consultas', async () => {
    await driveItemPermitido('X', A)
    expect(drive.getFileMetadata.mock.calls.length).toBeLessThanOrEqual(3)
    drive.getFileMetadata.mockClear()
    await driveItemPermitido('Z', A)
    expect(drive.getFileMetadata.mock.calls.length).toBeLessThanOrEqual(2)
    drive.getFileMetadata.mockClear()
    await driveItemPermitido('fundo11', A)
    expect(drive.getFileMetadata.mock.calls.length).toBeLessThanOrEqual(12)
    drive.getFileMetadata.mockClear()
    expect((await driveItemPermitido('fundo3', A, { profundidadeMaxima: 2 })).permitido).toBe(false)
  })

  it('a memória é por requisição: dividida dentro dela, nunca entre pessoas', async () => {
    const memo = new Map()
    await Promise.all([driveItemPermitido('fileA', A, { memo }), driveItemPermitido('grandA', A, { memo })])
    const ids = drive.getFileMetadata.mock.calls.map((c) => c[0])
    expect(new Set(ids).size).toBe(ids.length)
    // Outra pessoa, outra memória: a decisão do projeto 1 não vaza para quem só vê o 2
    expect((await driveItemPermitido('fileA', B, { memo: new Map() })).permitido).toBe(false)
    // Mesma memória, outras raízes: os metadados são os mesmos, a decisão não
    expect((await driveItemPermitido('fileA', B, { memo })).permitido).toBe(false)
  })
})

describe('escopoDoDriveWeb', () => {
  it('admin: Drive inteiro', async () => {
    expect((await escopoDoDriveWeb('user_admin')).admin).toBe(true)
  })
  it('as raízes são as pastas dos projetos visíveis, com os nomes do banco', async () => {
    const a = await escopoDoDriveWeb('userA')
    expect(a.admin).toBe(false)
    expect([...a.raizes].sort()).toEqual(['rootA', 'rootAimg'])
    expect(a.raizesComNome).toEqual([
      { id: 'rootA', name: 'Cliente A' },
      { id: 'rootAimg', name: 'Imagens A' },
    ])
    expect([...(await escopoDoDriveWeb('userAB')).raizes].sort()).toEqual(['rootA', 'rootAimg', 'rootB'])
  })
  it('sem projeto, sem raiz e sem consulta ao banco de projetos', async () => {
    const n = await escopoDoDriveWeb('userNone')
    expect(n).toEqual({ admin: false, raizes: new Set(), raizesComNome: [] })
    expect(dbFalso.project.findMany).not.toHaveBeenCalled()
  })
  it('raizesDoProjeto lê as três pastas', async () => {
    expect([...(await raizesDoProjeto(1))].sort()).toEqual(['rootA', 'rootAimg'])
    expect([...(await raizesDoProjeto(99))]).toEqual([])
  })
})

describe('assertDriveDoProjeto', () => {
  it('foto sob as pastas do projeto passa e devolve o id efetivo', async () => {
    expect(await assertDriveDoProjeto(1, 'fileA')).toBe('fileA')
    expect(await assertDriveDoProjeto(1, 'shortA')).toBe('fileB')
  })
  it('foto de outro projeto, inexistente ou com erro do Drive: o mesmo 404', async () => {
    const erros = await Promise.all(
      ['fileB', 'nao-existe', 'boom', 'root', ''].map((id) => assertDriveDoProjeto(1, id).catch((e) => e)),
    )
    for (const e of erros) {
      expect(e).toMatchObject({ code: 'FOTO_NAO_ENCONTRADA', status: 404, message: 'Foto não encontrada.' })
    }
  })
  it('foto indexada no projeto passa sem consultar o Drive; indexada em OUTRO projeto, não', async () => {
    embeddings.add('1:fileB')
    expect(await assertDriveDoProjeto(1, 'fileB')).toBe('fileB')
    expect(drive.getFileMetadata).not.toHaveBeenCalled()
    await expect(assertDriveDoProjeto(2, 'fileA')).rejects.toMatchObject({ status: 404 })
    embeddings.clear()
    embeddings.add('2:fileA')
    await expect(assertDriveDoProjeto(1, 'fileB')).rejects.toMatchObject({ status: 404 })
  })
  it('id inválido é recusado antes do banco e do Drive', async () => {
    await expect(assertDriveDoProjeto(1, "x' in parents or 'rootA")).rejects.toMatchObject({ status: 404 })
    expect(dbFalso.photoEmbedding.findUnique).not.toHaveBeenCalled()
    expect(drive.getFileMetadata).not.toHaveBeenCalled()
  })
})
