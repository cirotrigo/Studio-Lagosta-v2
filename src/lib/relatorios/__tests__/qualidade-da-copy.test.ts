/**
 * O serviço da qualidade da copy com o banco DUBLADO: o que importa aqui é a
 * degradação (esquema dos PRs 3/7 ausente diz o que falta e não derruba) e o
 * orçamento de tempo da carteira. As regras de medida estão no teste do
 * contrato.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const dubles = vi.hoisted(() => ({
  socialPost: { findMany: vi.fn() },
  page: { findMany: vi.fn() },
  itemDePlano: { findMany: vi.fn() },
  learningSignal: { findMany: vi.fn() },
  brandVoice: { findUnique: vi.fn() },
  $queryRaw: vi.fn(),
}))
vi.mock('@/lib/db', () => ({ db: dubles }))

import { medirQualidadeDaCarteira, medirQualidadeDaCopyDoCliente } from '../qualidade-da-copy'

const janela = { inicio: new Date('2026-09-07T03:00:00Z'), fim: new Date('2026-09-14T03:00:00Z') }
const cliente = { projectId: 6, nome: 'Espeto Gaúcho' }

function erroPrisma(code: string, meta: Record<string, unknown>) {
  return Object.assign(new Error(`Prisma ${code}`), { code, meta })
}

beforeEach(() => {
  vi.clearAllMocks()
  dubles.socialPost.findMany.mockResolvedValue([{ id: 'post-1', pageId: 'page-1', generationId: null, createdAt: new Date('2026-09-08T12:00:00Z') }])
  dubles.$queryRaw.mockResolvedValue([])
  dubles.page.findMany.mockResolvedValue([{ id: 'page-1', copyAutoral: null, layers: '[]' }])
  dubles.itemDePlano.findMany.mockResolvedValue([])
  dubles.learningSignal.findMany.mockResolvedValue([])
  dubles.brandVoice.findUnique.mockResolvedValue(null)
})

describe('medirQualidadeDaCopyDoCliente', () => {
  it('coluna do PR 3 ausente: a medida sai indisponível DIZENDO o que falta, sem lançar', async () => {
    dubles.page.findMany.mockRejectedValue(erroPrisma('P2022', { column: 'Page.copyAutoral' }))
    const r = await medirQualidadeDaCopyDoCliente(cliente, janela)
    expect(r.qualidade).toBeNull()
    expect(r.indisponivel).toMatch(/PRs 3\/7/)
    expect(r.indisponivel).toMatch(/Page\.copyAutoral/)
  })

  it('tabela do PR 7 ausente: só a voz fica sem versão, a medida sai', async () => {
    dubles.brandVoice.findUnique.mockRejectedValue(erroPrisma('P2021', { table: 'BrandVoice' }))
    const r = await medirQualidadeDaCopyDoCliente(cliente, janela)
    expect(r.indisponivel).toBeNull()
    expect(r.qualidade?.pecas).toBe(1)
    expect(r.qualidade?.foraDoDenominador.semContrato).toBe(1)
    expect(r.avisos.join(' ')).toMatch(/BrandVoice/)
  })

  it('erro que não é de esquema também não derruba — vira indisponível com o motivo', async () => {
    dubles.$queryRaw.mockRejectedValue(new Error('conexão caiu'))
    const r = await medirQualidadeDaCopyDoCliente(cliente, janela)
    expect(r.indisponivel).toMatch(/conexão caiu/)
  })

  it('semana sem posts: zero peças, sem ir às outras tabelas', async () => {
    dubles.socialPost.findMany.mockResolvedValue([])
    const r = await medirQualidadeDaCopyDoCliente(cliente, janela)
    expect(r.qualidade?.pecas).toBe(0)
    expect(dubles.$queryRaw).not.toHaveBeenCalled()
    expect(dubles.page.findMany).not.toHaveBeenCalled()
  })
})

describe('medirQualidadeDaCarteira', () => {
  it('cliente que não cabe no prazo sai em foraDoOrcamento, nunca some', async () => {
    let relogio = 0
    const r = await medirQualidadeDaCarteira(
      [cliente, { projectId: 7, nome: 'By Rock' }],
      janela,
      { prazo: 30_000, tetoPorClienteMs: 25_000, agora: () => (relogio += 20_000) },
    )
    expect(r.porCliente.has(6)).toBe(true)
    expect(r.bloco.foraDoOrcamento).toEqual(['By Rock'])
  })

  it('cliente indisponível entra no bloco com o motivo', async () => {
    dubles.page.findMany.mockRejectedValue(erroPrisma('P2022', { column: 'Page.copyAutoral' }))
    const r = await medirQualidadeDaCarteira([cliente], janela, { prazo: Date.now() + 60_000 })
    expect(r.bloco.indisponiveis).toHaveLength(1)
    expect(r.bloco.indisponiveis[0].nome).toBe('Espeto Gaúcho')
    expect(r.carteira).toBeNull()
  })
})
