/**
 * Contrato serviço → leitor do envio de elemento (26/10/2026).
 *
 * O POST /api/projects/:id/elements gravava o elemento, mas `importarElemento` selecionava id/name/category/fileUrl
 * sem `projectId`; o leitor ESTRITO do editor (`lerElementoCriado`) exige o `projectId` do projeto pedido e acusava
 * "O servidor não confirmou o elemento enviado." — aviso falso sobre um envio que deu certo (reproduzido 6 vezes).
 * O banco é falso, mas respeita o `select` como o Prisma: o campo só volta se for pedido.
 */
import sharp from 'sharp'
import { beforeAll, describe, expect, it, vi } from 'vitest'

const banco = vi.hoisted(() => ({ ultimoSelect: null as Record<string, boolean> | null }))

vi.mock('@/lib/db', () => ({
  db: {
    project: { findUnique: async ({ where }: { where: { id: number } }) => (where.id > 0 ? { id: where.id } : null) },
    element: {
      create: async ({ data, select }: { data: Record<string, unknown>; select?: Record<string, boolean> }) => {
        banco.ultimoSelect = select ?? null
        const linha: Record<string, unknown> = { id: 6, createdAt: new Date('2026-10-26T21:33:00Z'), ...data }
        return select ? Object.fromEntries(Object.keys(select).filter((k) => select[k]).map((k) => [k, linha[k]])) : linha
      },
    },
  },
}))
vi.mock('@vercel/blob', () => ({
  put: async (key: string) => ({ url: `http://127.0.0.1:3311/b/${key}` }),
}))

import { importarElemento } from '../elementos'
import { RespostaDeElementoInvalida, lerElementoCriado } from '../lista-de-elementos'

let png: Buffer
beforeAll(async () => {
  process.env.BLOB_READ_WRITE_TOKEN = 'vercel_blob_rw_teste_sintetico'
  png = await sharp({ create: { width: 4, height: 2, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0.5 } } }).png().toBuffer()
})

/** O que o editor recebe: o retorno do serviço passa pelo JSON da rota (`NextResponse.json`). */
async function enviar(projectId: number) {
  const r = await importarElemento({ projectId, bytes: png, fileName: 'SOMBRAS LF DESGN (20).png', uploadedBy: 'user_teste' })
  return JSON.parse(JSON.stringify(r)) as unknown
}

describe('importarElemento → lerElementoCriado', () => {
  it('o elemento recém-gravado é confirmado pelo leitor estrito do mesmo projeto', async () => {
    const dado = await enviar(1)
    expect(lerElementoCriado(dado, 1)).toEqual({
      id: 6,
      name: 'SOMBRAS LF DESGN (20)',
      fileUrl: expect.stringMatching(/^http:\/\/127\.0\.0\.1:3311\/b\/projects\/1\/elements\/\d+-SOMBRAS_LF_DESGN__20_\.png$/),
      category: null,
      projectId: 1,
    })
  })

  it('o projectId vem do registro gravado (select do banco), não de um eco do pedido', async () => {
    await enviar(11)
    expect(banco.ultimoSelect).toMatchObject({ projectId: true })
  })

  it('o leitor continua recusando a resposta lida para outro projeto', async () => {
    const dado = await enviar(1)
    expect(() => lerElementoCriado(dado, 6)).toThrow(RespostaDeElementoInvalida)
  })
})
