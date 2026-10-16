/**
 * CP5b § 3.3 — `mesclarFieldValuesDaArte` nas QUATRO formas: sem nada e só `resultUrl`, o SQL é byte a byte o de
 * sempre (os chamadores atuais não mudam); com `somenteSe` o `WHERE` leva o vínculo projeto + página E o `EXISTS` da
 * página no projeto; as duas opções juntas aplicam as duas. Cliente falso que captura o template literal;
 * `@/lib/db` mockado antes do import.
 */
import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/db', () => ({ db: {} }))

import { mesclarFieldValuesDaArte } from '../mesclar-field-values'

function clienteFalso(linhas = 1) {
  const chamadas: Array<{ sql: string; valores: unknown[] }> = []
  const client = {
    $executeRaw: (strings: TemplateStringsArray, ...valores: unknown[]) => {
      chamadas.push({ sql: strings.join('?'), valores })
      return Promise.resolve(linhas)
    },
  }
  return { client: client as never, chamadas }
}

const PREFIXO = `UPDATE "Generation" SET "fieldValues" = (CASE WHEN jsonb_typeof("fieldValues") = 'object' THEN "fieldValues" ELSE '{}'::jsonb END) || ?::jsonb`
const VINCULO = `WHERE "id" = ? AND "projectId" = ? AND "fieldValues"->>'pageId' = ? AND EXISTS (SELECT 1 FROM "Page" p JOIN "Template" t ON t."id" = p."templateId" WHERE p."id" = ? AND t."projectId" = ?)`

describe('mesclarFieldValuesDaArte — as quatro formas do SQL', () => {
  it('sem colunas: o SQL de sempre, patch serializado inteiro, devolve as linhas', async () => {
    const { client, chamadas } = clienteFalso(1)
    expect(await mesclarFieldValuesDaArte(client, 'gen-1', { a: 1, b: { c: 2 } })).toBe(1)
    expect(chamadas).toEqual([{ sql: `${PREFIXO} WHERE "id" = ?`, valores: ['{"a":1,"b":{"c":2}}', 'gen-1'] }])
  })

  it('só resultUrl: o SQL de sempre com a coluna', async () => {
    const { client, chamadas } = clienteFalso()
    await mesclarFieldValuesDaArte(client, 'gen-1', { a: 1 }, { resultUrl: 'https://blob/x.png' })
    expect(chamadas[0]).toEqual({ sql: `${PREFIXO}, "resultUrl" = ? WHERE "id" = ?`, valores: ['{"a":1}', 'https://blob/x.png', 'gen-1'] })
  })

  it('só somenteSe: vínculo da Generation + EXISTS da página no projeto, com pageId e projectId vinculados ao EXISTS; 0 linhas quando não bate; resultUrl nunca tocado', async () => {
    const { client, chamadas } = clienteFalso(0)
    expect(await mesclarFieldValuesDaArte(client, 'gen-1', { gateDaArte: { x: 1 } }, { somenteSe: { projectId: 8, pageId: 'pg-1' } })).toBe(0)
    expect(chamadas[0]).toEqual({ sql: `${PREFIXO} ${VINCULO}`, valores: ['{"gateDaArte":{"x":1}}', 'gen-1', 8, 'pg-1', 'pg-1', 8] })
    expect(chamadas[0].sql).not.toContain('resultUrl')
  })

  it('as duas juntas: SET com resultUrl e o WHERE do vínculo inteiro', async () => {
    const { client, chamadas } = clienteFalso(1)
    await mesclarFieldValuesDaArte(client, 'gen-1', { a: 1 }, { resultUrl: 'https://blob/x.png', somenteSe: { projectId: 8, pageId: 'pg-1' } })
    expect(chamadas[0]).toEqual({ sql: `${PREFIXO}, "resultUrl" = ? ${VINCULO}`, valores: ['{"a":1}', 'https://blob/x.png', 'gen-1', 8, 'pg-1', 'pg-1', 8] })
  })
})
