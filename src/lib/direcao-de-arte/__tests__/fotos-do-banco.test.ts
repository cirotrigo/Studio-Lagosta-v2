/**
 * Leitura do branch para o `--fotos` (contrato § 3.2 e § 3.5), com um `tx` FALSO que grava as chamadas: sem banco, sem rede.
 */
import fs from 'node:fs'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  MIGRACAO_DA_PROVA,
  SQL_DO_MODULO,
  SQL_MARCADOR,
  SQL_MIGRACAO_DA_PROVA,
  SQL_POSTS,
  SQL_SOMENTE_LEITURA,
  SQL_TABELA_DA_PROVA,
  SQL_TABELA_DE_MIGRACOES,
  lerDoBranch,
  paraPostLido,
  type TxSomenteLeitura,
} from '../../../../scripts/fixtures/fotos-do-banco'
import { STORES_DO_STUDIO, contarCliente } from '../../../../scripts/fixtures/selecao-de-fotos'

const RAIZ = path.resolve(__dirname, '../../../..')
const ATE = new Date('2026-10-17T00:00:00Z')
const STORE = `https://${STORES_DO_STUDIO[0]}`

interface Sinais { tabela?: boolean; migracoes?: boolean; registrada?: boolean; linhas?: Record<number, Array<Record<string, unknown>>> }
function txFalso(s: Sinais = {}) {
  const { tabela = true, migracoes = true, registrada = true, linhas = {} } = s
  const chamadas: Array<{ tipo: 'execute' | 'query'; sql: string; valores: unknown[] }> = []
  const tx: TxSomenteLeitura = {
    async $executeRawUnsafe(sql, ...valores) {
      chamadas.push({ tipo: 'execute', sql, valores })
      return 0
    },
    async $queryRawUnsafe<T>(sql: string, ...valores: unknown[]): Promise<T> {
      chamadas.push({ tipo: 'query', sql, valores })
      const r = (v: unknown) => v as T
      if (sql === SQL_TABELA_DA_PROVA) return r([{ existe: tabela }])
      if (sql === SQL_TABELA_DE_MIGRACOES) return r([{ existe: migracoes }])
      if (sql === SQL_MIGRACAO_DA_PROVA) return r([{ registrada }])
      if (sql === SQL_MARCADOR) return r([{ provas: 3, provaMaisAntiga: new Date('2026-10-12T13:00:00Z'), provaMaisRecente: '2026-10-16T10:00:00.000Z', postMaisRecente: new Date('2026-10-16T11:00:00Z') }])
      if (sql === SQL_POSTS) return r(linhas[valores[0] as number] ?? [])
      throw new Error(`SQL inesperado: ${sql}`)
    },
  }
  return { tx, chamadas }
}

const linha = (id: string, extra: Record<string, unknown> = {}) => ({
  id, status: 'POSTED', postType: 'STORY', mediaUrls: [`${STORE}/posts/rendered/${id}.png`], pageId: 'pg-1',
  sentAt: null, latePublishedAt: '2026-10-15T12:00:00.000Z', scheduledDatetime: null, createdAt: '2026-10-14T12:00:00.000Z', provas: [], ...extra,
})

afterEach(() => vi.unstubAllGlobals())

describe('T10 lerDoBranch: transação somente leitura', () => {
  it('a 1ª chamada é exatamente SET TRANSACTION READ ONLY; todo SQL enviado pertence a SQL_DO_MODULO', async () => {
    const { tx, chamadas } = txFalso({ linhas: { 7: [linha('a')], 8: [] } })
    await lerDoBranch(tx, [7, 8], ATE)
    expect(chamadas[0]).toEqual({ tipo: 'execute', sql: 'SET TRANSACTION READ ONLY', valores: [] })
    expect(SQL_SOMENTE_LEITURA).toBe('SET TRANSACTION READ ONLY')
    expect(chamadas.filter((c) => c.tipo === 'execute')).toHaveLength(1)
    for (const c of chamadas) expect(SQL_DO_MODULO, c.sql).toContain(c.sql)
    expect(chamadas.filter((c) => c.sql === SQL_POSTS).map((c) => c.valores)).toEqual([[7, ATE], [8, ATE]])
    expect(chamadas.find((c) => c.sql === SQL_MIGRACAO_DA_PROVA)?.valores).toEqual([MIGRACAO_DA_PROVA])
  })
  it('nenhuma string de SQL_DO_MODULO escreve (palavra inteira, qualquer caixa)', () => {
    const ESCRITA = /\b(INSERT|UPDATE|DELETE|ALTER|DROP|CREATE|TRUNCATE|GRANT|MERGE|UPSERT|COPY|REVOKE|COMMENT|VACUUM)\b/i
    expect(SQL_DO_MODULO.length).toBe(6)
    for (const sql of SQL_DO_MODULO) expect(sql, sql).not.toMatch(ESCRITA)
    // a regex de palavra inteira pega a escrita mesmo em minúsculas e não confunde "updatedAt"/"createdAt"
    expect('delete from x').toMatch(ESCRITA)
    expect('"updatedAt", "createdAt"').not.toMatch(ESCRITA)
  })
  it('o SQL dos posts não filtra por janela nem por status (a seleção pura conta cada descarte)', () => {
    expect(SQL_POSTS).not.toMatch(/"status"\s*=|sp\.status\s*=|"latePublishedAt"\s*[<>]|"sentAt"\s*[<>]/)
    expect(SQL_POSTS).toMatch(/sp\."createdAt" < \$2/)
  })
})

describe('T11 sinais da contagem', () => {
  const MSG_TABELA = 'tabela PostRenderProof ausente'
  const MSG_MIGRACAO = `migração ${MIGRACAO_DA_PROVA} não registrada em _prisma_migrations`
  it('(a) tabela ausente → recusa com o sinal exato, causa indeterminada, sem ler posts', async () => {
    const { tx, chamadas } = txFalso({ tabela: false })
    expect(await lerDoBranch(tx, [7], ATE)).toEqual({ recusa: [MSG_TABELA], causa: 'indeterminada' })
    expect(chamadas.some((c) => c.sql === SQL_POSTS || c.sql === SQL_MARCADOR)).toBe(false)
  })
  it('(b) migração não registrada com a tabela presente', async () => {
    expect(await lerDoBranch(txFalso({ registrada: false }).tx, [7], ATE)).toEqual({ recusa: [MSG_MIGRACAO], causa: 'indeterminada' })
  })
  it('(c) os dois', async () => {
    expect(await lerDoBranch(txFalso({ tabela: false, registrada: false }).tx, [7], ATE)).toEqual({ recusa: [MSG_TABELA, MSG_MIGRACAO], causa: 'indeterminada' })
  })
  it('(c2) _prisma_migrations inexistente → recusa sem consultar a tabela que não existe', async () => {
    const { tx, chamadas } = txFalso({ migracoes: false })
    expect(await lerDoBranch(tx, [7], ATE)).toEqual({ recusa: [MSG_MIGRACAO], causa: 'indeterminada' })
    expect(chamadas.some((c) => c.sql === SQL_MIGRACAO_DA_PROVA)).toBe(false)
    expect(await lerDoBranch(txFalso({ migracoes: false, tabela: false }).tx, [7], ATE)).toEqual({ recusa: [MSG_TABELA, MSG_MIGRACAO], causa: 'indeterminada' })
  })
  it('(d) tudo presente e nenhuma prova na seleção → não recusa, devolve o marcador rotulado', async () => {
    const r = await lerDoBranch(txFalso({ linhas: { 7: [linha('a'), linha('b')] } }).tx, [7], ATE)
    expect('recusa' in r).toBe(false)
    if ('recusa' in r) return
    expect(r.marcador).toEqual({
      rotulo: 'estimado pelo dado mais recente do branch (a idade real é a de db:dev:status)',
      provas: 3,
      provaMaisAntiga: '2026-10-12T13:00:00.000Z',
      provaMaisRecente: '2026-10-16T10:00:00.000Z',
      postMaisRecente: '2026-10-16T11:00:00.000Z',
    })
    const posts = r.postsPorCliente.get(7)!
    expect(posts.every((p) => p.provas.length === 0)).toBe(true)
    expect(contarCliente(7, posts, { desde: new Date('2026-10-12T00:00:00Z'), ate: ATE, populacao: 'publicados', imutabilidadeComprovada: false }).exclusoes).toEqual({ 'sem-prova': 2 })
  })
  it('contarCliente nunca chama fetch (espião que lança) — nem com elegíveis e imutabilidade verdadeira', () => {
    const espiao = vi.fn(() => {
      throw new Error('fetch proibido na contagem')
    })
    vi.stubGlobal('fetch', espiao)
    const midia = `${STORE}/posts/rendered/a.png`
    const p = paraPostLido(linha('a', {
      mediaUrls: [midia],
      provas: [{ mediaUrl: midia, proofVersion: 1, createdAt: '2026-10-15T11:00:00.000Z', layersSnapshot: [{ id: 'bg-foto', type: 'image', fileUrl: `${STORE}/uploads/u/x.jpg`, position: { x: 0, y: 0 }, size: { width: 1080, height: 1920 } }] }],
    }))
    const r = contarCliente(7, [p], { desde: new Date('2026-10-12T00:00:00Z'), ate: ATE, populacao: 'publicados', imutabilidadeComprovada: true })
    expect(r.elegiveisTeto).toBe(1)
    expect(espiao).not.toHaveBeenCalled()
  })
})

describe('paraPostLido', () => {
  it('converte datas, lê provas em string JSON e normaliza campos ausentes', () => {
    const p = paraPostLido({
      id: 1, status: 'POSTED', postType: 'STORY', mediaUrls: 'nao-array', pageId: 5,
      sentAt: 'lixo', latePublishedAt: new Date('2026-10-15T12:00:00Z'), scheduledDatetime: null, createdAt: '2026-10-14T12:00:00Z',
      provas: JSON.stringify([{ mediaUrl: 'u', proofVersion: 1, createdAt: '2026-10-15T11:00:00Z', layersSnapshot: '[]' }]),
    })
    expect(p).toEqual({
      id: '1', status: 'POSTED', postType: 'STORY', mediaUrls: [], pageId: null, sentAt: null,
      latePublishedAt: new Date('2026-10-15T12:00:00Z'), scheduledDatetime: null, createdAt: new Date('2026-10-14T12:00:00Z'),
      provas: [{ mediaUrl: 'u', proofVersion: 1, createdAt: new Date('2026-10-15T11:00:00Z'), layersSnapshot: '[]' }],
    })
  })
})

describe('T14 pureza de fotos-do-banco.ts', () => {
  it('não importa banco, disco nem rede (só tipos de selecao-de-fotos)', () => {
    const fonte = fs.readFileSync(path.join(RAIZ, 'scripts/fixtures/fotos-do-banco.ts'), 'utf8')
    const mods = [...fonte.matchAll(/(?:\bfrom\s+|\bimport\s*\(\s*|\brequire\s*\(\s*|^\s*import\s+)['"]([^'"]+)['"]/gm)].map((m) => m[1])
    expect(mods).toEqual(['./selecao-de-fotos'])
    expect(fonte).toMatch(/import type \{[^}]+\} from '\.\/selecao-de-fotos'/)
  })
})
