import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * R12-03 (18/09/2026): `definirTool` fecha só a raiz, e nos objetos aninhados
 * de compor-arte e compor-leva o zod DESCARTAVA a chave desconhecida — a peça
 * saía diferente do pedido, com cara de resultado válido. Pela porta REAL:
 * chave errada em cada nível recusa com o caminho e o serviço não é chamado;
 * a chamada certa chega ao serviço como veio, inclusive quando o objeto chega
 * como string JSON (a coerção roda antes do parse).
 */
const mocks = vi.hoisted(() => ({ comporPeca: vi.fn(), enfileirarPeca: vi.fn() }))
vi.mock('@/lib/compositor/compor', () => ({ comporPeca: mocks.comporPeca }))
vi.mock('@/lib/compositor/fila', () => ({ enfileirarPeca: mocks.enfileirarPeca }))
vi.mock('@/lib/mcp/tools', () => ({ quemDecidiu: vi.fn(async () => 'u1'), canalDoPrincipal: vi.fn(() => 'claude-ai') }))

import { toolsDoCompositor } from '../catalogo/compositor'
import { executarTool } from '../registro/porta'

const indice = new Map(toolsDoCompositor.map((t) => [t.nome, t]))
const gates = { projeto: async () => undefined, curador: async () => undefined }
const pela = (nome: string, args: Record<string, unknown>) =>
  executarTool(indice, 'remoto', nome, args, { kind: 'user' } as never, { gates })
const texto = (r: { content: Array<Record<string, unknown>> }) => String(r.content[0]?.text)

const bloco = { papel: 'headline', linhas: ['Rodízio em [dobro]'] }
const peca = {
  formato: 'story',
  blocos: [bloco],
  preferencias: { ancora: 'rodape', cantoDaMarca: 'inferior-direito' },
  carrossel: { slide: 2, de: 5 },
  quando: '2026-09-21T19:00:00-03:00',
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.comporPeca.mockResolvedValue({
    diagnostico: { posicao: { ancora: 'rodape', alinha: 'esquerda', crop: 'centro' }, logo: null, blocos: [], avisos: [] },
    persistido: { generationId: 'g1', pageId: 'p1', url: 'https://blob/p1.png', editUrl: 'e', galleryUrl: 'g' },
  })
  mocks.enfileirarPeca.mockResolvedValue({ generationId: 'g-leva' })
})

describe('compor-arte: chave desconhecida em cada nível é recusada com o caminho', () => {
  it.each([
    ['raiz', { destaque: ['dobro'] }, 'A ferramenta compor-arte não conhece "destaque"'],
    ['bloco', { blocos: [{ ...bloco, herdaDe: 'apoio' }] }, '"blocos.0" não aceita "herdaDe"'],
    ['preferencias', { preferencias: { ancora: 'rodape', canto: 'inferior-direito' } }, '"preferencias" não aceita "canto"'],
    ['carrossel', { carrossel: { slide: 2, total: 5 } }, '"carrossel" não aceita "total"'],
  ])('%s', async (_nivel, troca, mensagem) => {
    const r = await pela('compor-arte', { projectId: 6, ...peca, ...troca })
    expect(r.isError).toBe(true)
    expect(texto(r)).toContain(mensagem)
    expect(mocks.comporPeca).not.toHaveBeenCalled()
  })

  it('controle: a peça certa chega ao compositor como veio', async () => {
    const r = await pela('compor-arte', { projectId: 6, ...peca })
    expect(r.isError).toBeUndefined()
    expect(mocks.comporPeca.mock.calls[0][0]).toMatchObject({ projectId: 6, ...peca })
  })

  it('string JSON é coagida ANTES do parse: a chave errada é recusada pelo nome, e a certa passa', async () => {
    const errada = await pela('compor-arte', { projectId: 6, ...peca, preferencias: '{"ancora":"rodape","canto":"inferior-direito"}' })
    expect(texto(errada)).toContain('"preferencias" não aceita "canto"')
    expect(mocks.comporPeca).not.toHaveBeenCalled()

    const certa = await pela('compor-arte', { projectId: 6, ...peca, preferencias: JSON.stringify(peca.preferencias), carrossel: JSON.stringify(peca.carrossel) })
    expect(certa.isError).toBeUndefined()
    expect(mocks.comporPeca.mock.calls[0][0]).toMatchObject({ preferencias: peca.preferencias, carrossel: peca.carrossel })
  })
})

describe('compor-leva: chave desconhecida em cada nível recusa a leva inteira', () => {
  it.each([
    ['raiz', { provar: true }, 'A ferramenta compor-leva não conhece "provar"'],
    ['item', { itens: [peca, { ...peca, provar: true }] }, '"itens.1" não aceita "provar"'],
    ['bloco do item', { itens: [{ ...peca, blocos: [{ ...bloco, herdaDe: 'apoio' }] }] }, '"itens.0.blocos.0" não aceita "herdaDe"'],
    ['preferencias do item', { itens: [{ ...peca, preferencias: { canto: 'inferior-direito' } }] }, '"itens.0.preferencias" não aceita "canto"'],
    ['carrossel do item', { itens: [{ ...peca, carrossel: { slide: 2, total: 5 } }] }, '"itens.0.carrossel" não aceita "total"'],
  ])('%s', async (_nivel, troca, mensagem) => {
    const r = await pela('compor-leva', { projectId: 6, itens: [peca], ...troca })
    expect(r.isError).toBe(true)
    expect(texto(r)).toContain(mensagem)
    expect(mocks.enfileirarPeca).not.toHaveBeenCalled()
  })

  it('controle: cada item chega à fila como veio, com o projectId da raiz', async () => {
    const r = await pela('compor-leva', { projectId: 6, itens: [peca, { ...peca, carrossel: { slide: 3, de: 5 } }] })
    expect(r.isError).toBeUndefined()
    expect(mocks.enfileirarPeca).toHaveBeenCalledTimes(2)
    expect(mocks.enfileirarPeca.mock.calls[0][0]).toMatchObject({ projectId: 6, ...peca })
    expect(mocks.enfileirarPeca.mock.calls[1][0]).toMatchObject({ carrossel: { slide: 3, de: 5 } })
  })

  it('itens como string JSON: coagidos antes do parse, a chave errada do item é recusada pelo caminho', async () => {
    const r = await pela('compor-leva', { projectId: 6, itens: JSON.stringify([{ ...peca, horario: '19:00' }]) })
    expect(texto(r)).toContain('"itens.0" não aceita "horario"')
    expect(mocks.enfileirarPeca).not.toHaveBeenCalled()
  })
})
