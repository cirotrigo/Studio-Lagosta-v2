/**
 * CP5b § 3.3 — H8: `gravarGateDaArte` grava SÓ por merge (`jsonb ||`), a chave `gateDaArte` inteira, com o `WHERE`
 * do vínculo + `EXISTS` (parâmetros = pageId e projectId do registro); 0 linhas → `'sem-vinculo'` sem lançar;
 * registro sem proveniência (clone estrutural) → `'sem-proveniencia'` sem SQL; exceção do banco PROPAGA; gravar duas
 * vezes = o mesmo SQL. Cliente falso; `@/lib/db` mockado antes do import. O mock prova a FORMA e os parâmetros do
 * EXISTS, não a relação no banco (limite dito: isso é do CP5c com banco de dev).
 */
import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/db', () => ({ db: {} }))

import { gravarGateDaArte } from '../gate-persistido'
import { type RegistroSelado } from '../gate-registro'
import { decidirOk } from './suporte/pagina-limpa'

function clienteFalso(resposta: number | Error) {
  const chamadas: Array<{ sql: string; valores: unknown[] }> = []
  const client = {
    $executeRaw: (strings: TemplateStringsArray, ...valores: unknown[]) => {
      chamadas.push({ sql: strings.join('?'), valores })
      return resposta instanceof Error ? Promise.reject(resposta) : Promise.resolve(resposta)
    },
  }
  return { client: client as never, chamadas }
}

describe('H8 — gravarGateDaArte', () => {
  it('um $executeRaw com jsonb ||, patch { gateDaArte: registro } inteiro, WHERE id + projectId + pageId e EXISTS com pageId/projectId do registro; resultUrl nunca tocado', async () => {
    const registro = decidirOk().registro
    const { client, chamadas } = clienteFalso(1)
    expect(await gravarGateDaArte(client, registro)).toBe('gravado')
    expect(chamadas).toHaveLength(1)
    expect(chamadas[0].sql).toContain(`|| ?::jsonb WHERE "id" = ? AND "projectId" = ? AND "fieldValues"->>'pageId' = ? AND EXISTS (SELECT 1 FROM "Page" p JOIN "Template" t ON t."id" = p."templateId" WHERE p."id" = ? AND t."projectId" = ?)`)
    expect(chamadas[0].sql).not.toContain('resultUrl')
    expect(chamadas[0].valores).toEqual([JSON.stringify({ gateDaArte: registro }), 'gen-1', 8, 'pg-1', 'pg-1', 8])
    expect(JSON.parse(chamadas[0].valores[0] as string)).toEqual({ gateDaArte: JSON.parse(JSON.stringify(registro)) })
  })

  it('0 linhas → sem-vinculo, sem lançar, com aviso', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { client } = clienteFalso(0)
    expect(await gravarGateDaArte(client, decidirOk().registro)).toBe('sem-vinculo')
    expect(warn).toHaveBeenCalledWith(expect.stringMatching(/não gravado.*gen-1.*pg-1.*8/))
    warn.mockRestore()
  })

  it('registro sem proveniência (clone estrutural, objeto montado à mão) → sem-proveniencia, NENHUM SQL', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const registro = decidirOk().registro
    const { client, chamadas } = clienteFalso(1)
    expect(await gravarGateDaArte(client, structuredClone(registro) as RegistroSelado)).toBe('sem-proveniencia')
    expect(await gravarGateDaArte(client, { ...registro } as RegistroSelado)).toBe('sem-proveniencia')
    expect(await gravarGateDaArte(client, JSON.parse(JSON.stringify(registro)) as RegistroSelado)).toBe('sem-proveniencia')
    expect(chamadas).toHaveLength(0)
    expect(warn).toHaveBeenCalledTimes(3)
    warn.mockRestore()
  })

  it('exceção do banco PROPAGA (quem chama decide o rollback)', async () => {
    const { client } = clienteFalso(new Error('connection reset'))
    await expect(gravarGateDaArte(client, decidirOk().registro)).rejects.toThrow('connection reset')
  })

  it('idempotente: gravar duas vezes produz o mesmo SQL e os mesmos valores; o registro continua congelado', async () => {
    const registro = decidirOk().registro
    const { client, chamadas } = clienteFalso(1)
    await gravarGateDaArte(client, registro)
    await gravarGateDaArte(client, registro)
    expect(chamadas[0]).toEqual(chamadas[1])
    expect(() => {
      ;(registro.gate as { resultado: string }).resultado = 'x'
    }).toThrow(TypeError)
  })
})
