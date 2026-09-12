import { describe, expect, it, vi } from 'vitest'
import { apagarBlobsDaRodada, limpezaFalhou, urlsDoBlob } from '../../../scripts/lib/limpeza-de-blobs'

/**
 * REV-90AA-01 (revisão do commit 90aa3739): o PNG que o ajuste A subiu e que o `persist` descartou tem de estar no
 * conjunto da limpeza — e a exclusão que falha é falha da prova, com as URLs que ficaram.
 */
const A = 'https://x.public.blob.vercel-storage.com/creatives/pagina-a-1.png'
const B = 'https://x.public.blob.vercel-storage.com/creatives/pagina-b-2.png'

describe('apagarBlobsDaRodada — a limpeza de Blob da prova (REV-90AA-01)', () => {
  it('só URLs do Blob, sem repetição; a URL de A (já descartada pelo persist) é tentada de novo junto com as outras', async () => {
    const apagar = vi.fn(async (_: string[]) => undefined)
    const r = await apagarBlobsDaRodada([A, B, A, 'https://prova.invalid/x.png', null, 42], apagar)
    expect(apagar).toHaveBeenCalledTimes(1)
    expect(apagar.mock.calls[0][0]).toEqual([A, B])
    expect(r).toEqual({ encontrados: 2, apagados: 2, erro: null, restantes: [] })
  })

  it('a exclusão que falha devolve o erro e as URLs que ficaram — quem chama conta como falha', async () => {
    const r = await apagarBlobsDaRodada(new Set([A, B]), async () => {
      throw new Error('503 do Blob')
    })
    expect(r).toEqual({ encontrados: 2, apagados: 0, erro: '503 do Blob', restantes: [A, B] })
  })

  it('conjunto sem URL do Blob não chama a exclusão', async () => {
    const apagar = vi.fn(async () => undefined)
    expect(await apagarBlobsDaRodada(['https://prova.invalid/y.png'], apagar)).toEqual({ encontrados: 0, apagados: 0, erro: null, restantes: [] })
    expect(apagar).not.toHaveBeenCalled()
    expect(urlsDoBlob([])).toEqual([])
  })

  it('exclusão que rejeita com mensagem VAZIA (`new Error(\'\')` ou `throw \'\'`) conta como falha da prova — o erro nunca sai vazio (REV-0352-01)', async () => {
    for (const rejeicao of [new Error(''), '', new Error('   ')]) {
      const r = await apagarBlobsDaRodada([A, B], async () => {
        throw rejeicao
      })
      expect(r.erro).not.toBeNull()
      expect(r.erro!.trim().length).toBeGreaterThan(0)
      expect(r.restantes).toEqual([A, B])
      expect(r.apagados).toBe(0)
      expect(limpezaFalhou(r)).toBe(true)
    }
  })

  it('a decisão da prova é `erro !== null` ou sobra de URL: erro vazio vindo de outro caminho também falha; limpeza completa passa (REV-0352-01)', async () => {
    expect(limpezaFalhou({ erro: '', restantes: [] })).toBe(true)
    expect(limpezaFalhou({ erro: null, restantes: [A] })).toBe(true)
    expect(limpezaFalhou(await apagarBlobsDaRodada([A], async () => undefined))).toBe(false)
    expect(limpezaFalhou(await apagarBlobsDaRodada([], async () => undefined))).toBe(false)
  })
})
