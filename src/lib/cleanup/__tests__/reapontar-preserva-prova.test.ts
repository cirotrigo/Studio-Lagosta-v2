/**
 * B1d — checkpoint e (Codex): a limpeza de Generations não reaponta a mídia de um post com o contrato semântico.
 *
 * A mídia desse post é a URL PROVADA (`PostRenderProof` é casada por post + URL). Trocar a URL pela do Drive deixaria
 * a prova na URL antiga — o post fica sem prova para a mídia atual. Então o post é preservado, e o blob dele NÃO pode
 * ser apagado (a URL provada morreria). O legado segue sendo reapontado como sempre.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const banco = vi.hoisted(() => ({ posts: [] as any[], gravados: [] as any[] }))

vi.mock('@/lib/db', () => ({
  db: {
    socialPost: {
      findMany: async () => banco.posts,
      updateMany: async ({ where, data }: any) => {
        banco.gravados.push({ id: where.id, ...data })
        return { count: 1 }
      },
    },
  },
}))

import { reapontarMidiasDosPosts } from '../reapontar-midias'

const BLOB = 'https://x.public.blob.vercel-storage.com/posts/rendered/a.png'
const DRIVE = 'https://lh3.googleusercontent.com/d/abc=w2000'

beforeEach(() => {
  banco.gravados = []
  banco.posts = [
    { id: 'semantico', mediaUrls: [BLOB], renderedImageUrl: BLOB, slotValues: { _slots: { manchete: 'X' } } },
    { id: 'legado', mediaUrls: [BLOB], renderedImageUrl: BLOB, slotValues: { 't-h': 'X' } },
  ]
})

describe('reapontarMidiasDosPosts', () => {
  it('post semântico é preservado (URL provada intacta) e o blob não pode ser apagado; legado é reapontado', async () => {
    const r = await reapontarMidiasDosPosts(BLOB, DRIVE)
    expect(banco.gravados.map((g) => g.id)).toEqual(['legado'])
    expect(r).toMatchObject({ posts: 1, preservados: 1, podeApagarBlob: false })
  })

  it('só legado: reaponta e libera o blob, como sempre', async () => {
    banco.posts = banco.posts.filter((p) => p.id === 'legado')
    expect(await reapontarMidiasDosPosts(BLOB, DRIVE)).toMatchObject({ posts: 1, preservados: 0, podeApagarBlob: true })
  })
})

describe('blob-cleanup: nenhum `del` do blob sem o aval do reapontamento', () => {
  it('as três chamadas guardam o resultado e só apagam o blob com `podeApagarBlob`', () => {
    const t = readFileSync(join(process.cwd(), 'src/lib/cleanup/blob-cleanup.ts'), 'utf8')
    const chamadas = [...t.matchAll(/reapontarMidiasDosPosts\(/g)]
    expect(chamadas).toHaveLength(3)
    for (const c of chamadas) {
      const trecho = t.slice(c.index, t.indexOf('await del(', c.index))
      expect(trecho).toMatch(/podeApagarBlob/)
    }
  })
})
