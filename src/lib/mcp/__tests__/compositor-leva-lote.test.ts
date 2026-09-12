import { beforeEach, describe, expect, it, vi } from 'vitest'

import { CreativeError } from '@/lib/creatives/errors'

/**
 * PR 11 de "Marca simples, copy melhor": a identidade de LOTE chega ao
 * conector. `compor-leva` aceita `loteId` na raiz e `itemId` em cada item,
 * confere a identidade da leva INTEIRA antes de enfileirar qualquer peça,
 * passa `lote` para `enfileirarPeca` (nunca para a spec, que é o que entra no
 * hash) e devolve o desfecho de cada peça — o conflito em `conflitos`, sem
 * derrubar os outros itens. Sem identidade, o comportamento de antes.
 */
const mocks = vi.hoisted(() => ({ enfileirarPeca: vi.fn() }))
vi.mock('@/lib/compositor/compor', () => ({ comporPeca: vi.fn() }))
vi.mock('@/lib/compositor/fila', () => ({ enfileirarPeca: mocks.enfileirarPeca }))
vi.mock('@/lib/compositor/medir-copy-service', () => ({ medirCopyDoProjeto: vi.fn() }))
vi.mock('@/lib/mcp/tools', () => ({ quemDecidiu: vi.fn(async () => 'u1'), canalDoPrincipal: vi.fn(() => 'claude-ai') }))

import { toolsDoCompositor } from '../catalogo/compositor'

const leva = toolsDoCompositor.find((t) => t.nome === 'compor-leva')!
const principal = { kind: 'user' } as never
const blocos = (texto: string) => [{ papel: 'headline', linhas: [texto] }]
const item = (itemId: string | undefined, texto: string) => ({ ...(itemId !== undefined ? { itemId } : {}), formato: 'story', nome: texto, blocos: blocos(texto) })

type Resultado = {
  enfileiradas: number
  reaproveitadas: number
  retomadas: number
  falhas: Array<{ indice: number; erro: string }>
  conflitos: Array<{ indice: number; itemId: string | null; diferencas: string[]; generationId: string | null }>
  pecas: Array<{ indice: number; itemId: string | null; generationId: string; nome: string | null; desfecho: string; situacao: string }>
  nota: string
}
const chamar = (args: Record<string, unknown>) => leva.handler({ projectId: 8, ...args }, principal) as Promise<Resultado>

async function recusa(args: Record<string, unknown>): Promise<CreativeError> {
  const erro = await chamar(args).then(
    () => null,
    (e: unknown) => e,
  )
  expect(erro).toBeInstanceOf(CreativeError)
  return erro as CreativeError
}

beforeEach(() => {
  vi.clearAllMocks()
  let n = 0
  mocks.enfileirarPeca.mockImplementation(async (_spec: unknown, opcoes: { lote?: { loteId: string; itemId: string } }) => {
    n += 1
    return { generationId: `g${n}`, jobId: `j${n}`, spec: {}, ...(opcoes.lote ? { lote: { ...opcoes.lote, desfecho: 'criado', situacao: 'pendente' } } : {}) }
  })
})

describe('compor-leva: schema da identidade de lote', () => {
  it('aceita loteId na raiz e itemId no item, e recusa acima de 120 caracteres', () => {
    const ok = leva.schema.safeParse({ projectId: 8, loteId: 'semana-2026-09-14', itens: [item('seg-19h-happy', 'Happy hour')] })
    expect(ok.success).toBe(true)
    expect(ok.success ? (ok.data as { loteId?: string }).loteId : null).toBe('semana-2026-09-14')
    expect(ok.success ? (ok.data as { itens: Array<{ itemId?: string }> }).itens[0].itemId : null).toBe('seg-19h-happy')
    expect(leva.schema.safeParse({ projectId: 8, loteId: 'x'.repeat(121), itens: [item('a', 'A')] }).success).toBe(false)
    expect(leva.schema.safeParse({ projectId: 8, loteId: 'l', itens: [item('x'.repeat(121), 'A')] }).success).toBe(false)
    expect(leva.schema.safeParse({ projectId: 8, loteId: '', itens: [item('a', 'A')] }).success).toBe(false)
  })
})

describe('compor-leva: a identidade de lote na porta', () => {
  it('com loteId e itemId, passa lote para enfileirarPeca e o itemId nunca entra na spec', async () => {
    const r = await chamar({ loteId: 'semana-2026-09-14', itens: [item('seg-19h-happy', 'Happy hour'), item('ter-12h-almoco', 'Almoço')] })
    expect(mocks.enfileirarPeca).toHaveBeenCalledTimes(2)
    const [spec0, opcoes0] = mocks.enfileirarPeca.mock.calls[0]
    expect(opcoes0).toMatchObject({ decididoPor: 'u1', autor: 'u1', canal: 'claude-ai', lote: { loteId: 'semana-2026-09-14', itemId: 'seg-19h-happy' } })
    expect(mocks.enfileirarPeca.mock.calls[1][1].lote).toEqual({ loteId: 'semana-2026-09-14', itemId: 'ter-12h-almoco' })
    expect(spec0).toMatchObject({ projectId: 8, formato: 'story', blocos: blocos('Happy hour') })
    expect(spec0).not.toHaveProperty('itemId')
    expect(spec0).not.toHaveProperty('loteId')
    expect(JSON.stringify(spec0)).not.toContain('seg-19h-happy')
    expect(r.pecas).toEqual([
      { indice: 0, itemId: 'seg-19h-happy', generationId: 'g1', nome: 'Happy hour', desfecho: 'criado', situacao: 'pendente' },
      { indice: 1, itemId: 'ter-12h-almoco', generationId: 'g2', nome: 'Almoço', desfecho: 'criado', situacao: 'pendente' },
    ])
    expect(r).toMatchObject({ enfileiradas: 2, reaproveitadas: 0, retomadas: 0, falhas: [], conflitos: [] })
  })

  it('loteId com um item sem itemId → LOTE_IDENTIDADE_INVALIDA (400) antes de enfileirar qualquer peça', async () => {
    const erro = await recusa({ loteId: 'semana', itens: [item('seg', 'A'), item(undefined, 'B')] })
    expect(erro.code).toBe('LOTE_IDENTIDADE_INVALIDA')
    expect(erro.status).toBe(400)
    expect((erro.details?.problemas as string[]).join(' ')).toContain('itens.1.itemId')
    expect(mocks.enfileirarPeca).not.toHaveBeenCalled()
  })

  it('itemId repetido na chamada (também depois de aparar espaços) → 400 antes de enfileirar', async () => {
    const igual = await recusa({ loteId: 'semana', itens: [item('seg', 'A'), item('ter', 'B'), item('seg', 'C')] })
    expect(igual.code).toBe('LOTE_IDENTIDADE_INVALIDA')
    expect(igual.status).toBe(400)
    expect((igual.details?.problemas as string[]).join(' ')).toContain('itens.2.itemId')
    const aparado = await recusa({ loteId: 'semana', itens: [item('seg', 'A'), item('seg ', 'B')] })
    expect(aparado.code).toBe('LOTE_IDENTIDADE_INVALIDA')
    expect(mocks.enfileirarPeca).not.toHaveBeenCalled()
  })

  it('itemId sem loteId → 400 antes de enfileirar (não é ignorado)', async () => {
    const erro = await recusa({ itens: [item(undefined, 'A'), item('seg', 'B')] })
    expect(erro.code).toBe('LOTE_IDENTIDADE_INVALIDA')
    expect(erro.status).toBe(400)
    expect((erro.details?.problemas as string[]).join(' ')).toContain('itemId sem loteId')
    expect(mocks.enfileirarPeca).not.toHaveBeenCalled()
  })

  it('identidade fora do contrato do lote (itemId só de espaços) → 400 antes de enfileirar', async () => {
    const erro = await recusa({ loteId: 'semana', itens: [item('seg', 'A'), item('   ', 'B')] })
    expect(erro.code).toBe('LOTE_IDENTIDADE_INVALIDA')
    expect(mocks.enfileirarPeca).not.toHaveBeenCalled()
  })

  it('LOTE_ITEM_CONFLITO vai para conflitos e os outros itens seguem para a fila', async () => {
    mocks.enfileirarPeca.mockImplementationOnce(async () => {
      throw new CreativeError('LOTE_ITEM_CONFLITO', 'já foi pedido com outro conteúdo', 409, { loteId: 'semana', itemId: 'seg', diferencas: ['blocos[headline].linhas', 'nome'], generationId: 'g-antiga' })
    })
    mocks.enfileirarPeca.mockImplementationOnce(async () => {
      throw new Error('Spec inválida — formato')
    })
    const r = await chamar({ loteId: 'semana', itens: [item('seg', 'A'), item('ter', 'B'), item('qua', 'C')] })
    expect(mocks.enfileirarPeca).toHaveBeenCalledTimes(3)
    expect(r.conflitos).toEqual([{ indice: 0, itemId: 'seg', diferencas: ['blocos[headline].linhas', 'nome'], generationId: 'g-antiga' }])
    expect(r.falhas).toEqual([{ indice: 1, erro: 'Spec inválida — formato' }])
    expect(r.pecas.map((p) => p.itemId)).toEqual(['qua'])
    expect(r.enfileiradas).toBe(1)
    expect(r.nota).toContain('Conflitos')
  })

  it('reaproveitado e retomado são contados à parte, com a situação vinda da fila', async () => {
    const respostas = [
      { desfecho: 'reaproveitado', situacao: 'pronta' },
      { desfecho: 'retomado', situacao: 'pendente' },
      { desfecho: 'criado', situacao: 'pendente' },
      { desfecho: 'reaproveitado', situacao: 'pendente' },
    ]
    for (const [i, lote] of respostas.entries()) {
      mocks.enfileirarPeca.mockImplementationOnce(async (_s: unknown, o: { lote: { loteId: string; itemId: string } }) => ({ generationId: `r${i}`, jobId: `j${i}`, spec: {}, lote: { ...o.lote, ...lote } }))
    }
    const r = await chamar({ loteId: 'semana', itens: [item('a', 'A'), item('b', 'B'), item('c', 'C'), item('d', 'D')] })
    expect(r).toMatchObject({ enfileiradas: 1, reaproveitadas: 2, retomadas: 1, falhas: [], conflitos: [] })
    expect(r.pecas.map((p) => [p.itemId, p.desfecho, p.situacao])).toEqual([
      ['a', 'reaproveitado', 'pronta'],
      ['b', 'retomado', 'pendente'],
      ['c', 'criado', 'pendente'],
      ['d', 'reaproveitado', 'pendente'],
    ])
    expect(r.nota).toContain('Reaproveitadas')
  })

  it('sem identidade de lote, o comportamento de antes: sem lote nas opções, tudo criado e pendente, erro comum em falhas', async () => {
    mocks.enfileirarPeca.mockImplementationOnce(async () => ({ generationId: 'g1', jobId: 'j1', spec: {} }))
    mocks.enfileirarPeca.mockImplementationOnce(async () => {
      throw new Error('Projeto 8 não encontrado')
    })
    const r = await chamar({ itens: [item(undefined, 'A'), item(undefined, 'B')] })
    expect(mocks.enfileirarPeca).toHaveBeenCalledTimes(2)
    for (const [, opcoes] of mocks.enfileirarPeca.mock.calls) {
      expect(opcoes).toEqual({ decididoPor: 'u1', autor: 'u1', canal: 'claude-ai' })
    }
    expect(r).toEqual({
      enfileiradas: 1,
      reaproveitadas: 0,
      retomadas: 0,
      falhas: [{ indice: 1, erro: 'Projeto 8 não encontrado' }],
      conflitos: [],
      pecas: [{ indice: 0, itemId: null, generationId: 'g1', nome: 'A', desfecho: 'criado', situacao: 'pendente' }],
      nota: 'As peças entram na galeria conforme a fila roda (ver-geracao com cada generationId). Nada foi cobrado.',
    })
  })
})
