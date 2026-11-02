import { describe, expect, it, vi } from 'vitest'
import { anotarCaixas, type DocumentoDoCatalogo } from '../anotar-caixa-do-assunto'

function dubles(images: DocumentoDoCatalogo['images'], respostas: Record<string, unknown>) {
  let drive: DocumentoDoCatalogo = { images }
  const ordem: string[] = []
  return {
    ordem,
    documento: () => drive,
    substituir: (id: string, campos: Record<string, unknown>) => {
      drive = { images: drive.images.map((e) => (e.driveFileId === id ? { ...e, ...campos } : e)) }
    },
    injetar: (entrada: DocumentoDoCatalogo['images'][number]) => {
      drive = { images: [...drive.images, entrada] }
    },
    input: {
      lerDocumento: async () => drive,
      pedirCaixa: vi.fn(async ({ driveFileId }: { driveFileId: string }) => {
        const r = respostas[driveFileId]
        if (r instanceof Error) throw r
        return r
      }),
      salvar: vi.fn(async (documento: DocumentoDoCatalogo) => {
        ordem.push('salvar')
        drive = documento
      }),
      backup: vi.fn(async () => {
        ordem.push('backup')
      }),
    },
  }
}

const antiga = (id: string, extra = {}) => ({ driveFileId: id, assunto: 'prato', description: 'texto', ...extra })

describe('anotarCaixas', () => {
  it('seleciona só as sem carimbo e grava só os dois campos', async () => {
    const d = dubles([antiga('a'), antiga('b', { caixaAnalisadaEm: 'x' })], { a: [0, 0, 500, 500], b: [1, 1, 2, 2] })
    const r = await anotarCaixas(d.input)
    expect(d.input.pedirCaixa).toHaveBeenCalledTimes(1)
    expect(r).toMatchObject({ pendentes: 1, anotadas: 1, invalidas: 0, erros: 0 })
    const [a, b] = d.documento().images as unknown as Array<Record<string, unknown>>
    expect(a).toEqual({ ...antiga('a'), caixaDoAssunto: { x0: 0, y0: 0, x1: 0.5, y1: 0.5 }, caixaAnalisadaEm: expect.any(String) })
    expect(b).toEqual(antiga('b', { caixaAnalisadaEm: 'x' }))
    expect(d.input.salvar.mock.calls[0][1 as 0]).toEqual(new Set(['a']))
  })

  it('null da visão grava e carimba; resposta inválida e erro da visão não gravam nem carimbam', async () => {
    const d = dubles([antiga('a'), antiga('b'), antiga('c')], { a: null, b: [1, 2, 3], c: new Error('429') })
    const r = await anotarCaixas(d.input)
    expect(r).toMatchObject({ anotadas: 1, invalidas: 1, erros: 1 })
    const [a, b, c] = d.documento().images as unknown as Array<Record<string, unknown>>
    expect(a).toMatchObject({ caixaDoAssunto: null, caixaAnalisadaEm: expect.any(String) })
    expect(b).toEqual(antiga('b'))
    expect(c).toEqual(antiga('c'))
  })

  it('o backup vem antes do primeiro save, uma vez só', async () => {
    const d = dubles([antiga('a'), antiga('b'), antiga('c')], { a: [0, 0, 9, 9], b: [0, 0, 9, 9], c: [0, 0, 9, 9] })
    await anotarCaixas({ ...d.input, salvarACada: 1 })
    expect(d.ordem).toEqual(['backup', 'salvar', 'salvar', 'salvar'])
  })

  it('a caixa que outro escritor regravou entre dois saves não é sobrescrita: o lote é por save', async () => {
    const d = dubles([antiga('a'), antiga('b')], { a: [0, 0, 500, 500], b: [0, 0, 250, 250] })
    const doOutro = { x0: 0.1, y0: 0.1, x1: 0.2, y1: 0.2 }
    d.input.pedirCaixa.mockImplementationOnce(async () => [0, 0, 500, 500]).mockImplementationOnce(async () => {
      d.substituir('a', { caixaDoAssunto: doOutro, caixaAnalisadaEm: 'do outro' })
      return [0, 0, 250, 250]
    })
    const r = await anotarCaixas({ ...d.input, salvarACada: 1 })
    expect(r.anotadas).toBe(2)
    expect(d.input.salvar.mock.calls.map((c) => [...(c[1 as 0] as unknown as Set<string>)])).toEqual([['a'], ['b']])
    expect(d.documento().images[0]).toMatchObject({ caixaDoAssunto: doOutro, caixaAnalisadaEm: 'do outro' })
  })

  it('--dry-run consulta a visão e não escreve nada', async () => {
    const d = dubles([antiga('a')], { a: [0, 0, 9, 9] })
    const r = await anotarCaixas({ ...d.input, dryRun: true })
    expect(r.anotadas).toBe(1)
    expect(d.input.salvar).not.toHaveBeenCalled()
    expect(d.input.backup).not.toHaveBeenCalled()
  })

  it('--drive-file-id e --limit recortam a seleção', async () => {
    const porId = dubles([antiga('a'), antiga('b')], { a: [0, 0, 9, 9], b: [0, 0, 9, 9] })
    await anotarCaixas({ ...porId.input, driveFileId: 'b' })
    expect(porId.input.pedirCaixa.mock.calls.map(([e]) => e.driveFileId)).toEqual(['b'])
    const limitado = dubles([antiga('a'), antiga('b')], { a: [0, 0, 9, 9], b: [0, 0, 9, 9] })
    await anotarCaixas({ ...limitado.input, limit: 1 })
    expect(limitado.input.pedirCaixa).toHaveBeenCalledTimes(1)
  })

  it('a entrada acrescentada pelo cron durante a rodada sobrevive ao save', async () => {
    const d = dubles([antiga('a')], { a: [0, 0, 9, 9] })
    d.input.pedirCaixa.mockImplementationOnce(async () => {
      d.injetar(antiga('nova'))
      return [0, 0, 9, 9]
    })
    await anotarCaixas(d.input)
    expect(d.documento().images.map((e) => e.driveFileId)).toEqual(['a', 'nova'])
  })
})
