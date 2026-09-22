/**
 * C15-03 no relatório de domingo: a gravação da semana vem ANTES da medida da
 * copy e nunca depende dela. A medida entra depois, num update best-effort.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const dubles = vi.hoisted(() => {
  const ordem: string[] = []
  return {
    ordem,
    db: {
      project: { findMany: vi.fn() },
      organizationProject: { findMany: vi.fn() },
      instagramFeed: { findMany: vi.fn() },
      socialPost: { findMany: vi.fn() },
      learningSignal: { findMany: vi.fn() },
      generation: { findMany: vi.fn() },
      instagramWeeklyReport: { upsert: vi.fn(), update: vi.fn() },
    },
    medir: vi.fn(),
  }
})

vi.mock('@/lib/db', () => ({ db: dubles.db }))
vi.mock('@/lib/instagram/feed-insights', () => ({ coletarFeedDeTodos: vi.fn(async () => ({})) }))
vi.mock('@/lib/windsor/coleta-feed', () => ({ coletarFeedViaWindsor: vi.fn(async () => ({})) }))
vi.mock('@/lib/windsor/relatorio-extras', () => ({ blocoAnunciosDaSemana: vi.fn(async () => null), blocoAvaliacoesDaSemana: vi.fn(async () => null) }))
vi.mock('@/lib/notifications/evolution', () => ({ isEvolutionConfigured: () => false, sendWhatsAppText: vi.fn() }))
vi.mock('@/lib/relatorios/qualidade-da-copy', () => ({ medirQualidadeDaCarteira: dubles.medir }))

import { gerarRelatorioSemanal } from '../semanal'
import { medirQualidadeDaCopy } from '../qualidade-da-copy-contrato'

const referencia = new Date('2026-09-13T23:00:00Z')

beforeEach(() => {
  vi.clearAllMocks()
  dubles.ordem.length = 0
  vi.spyOn(console, 'error').mockImplementation(() => {})
  dubles.db.project.findMany.mockResolvedValue([{ id: 6, name: 'Espeto Gaúcho', instagramUsername: 'espeto', instagramAccessToken: null }])
  dubles.db.organizationProject.findMany.mockResolvedValue([])
  dubles.db.instagramFeed.findMany.mockResolvedValue([])
  dubles.db.socialPost.findMany.mockImplementation(async (a: { where: { postType?: unknown } }) =>
    a.where.postType === 'STORY' ? [{ sentAt: new Date('2026-09-08T15:00:00Z'), analyticsReach: 10 }] : [],
  )
  dubles.db.learningSignal.findMany.mockResolvedValue([])
  dubles.db.generation.findMany.mockResolvedValue([])
  dubles.db.instagramWeeklyReport.upsert.mockImplementation(async () => void dubles.ordem.push('upsert'))
  dubles.db.instagramWeeklyReport.update.mockImplementation(async () => void dubles.ordem.push('update'))
  dubles.medir.mockImplementation(async () => {
    dubles.ordem.push('medir')
    return {
      porCliente: new Map([[6, { projectId: 6, nome: 'Espeto Gaúcho', qualidade: null, medidas: [], indisponivel: 'passou do teto de tempo por cliente', avisos: [] }]]),
      carteira: null,
      bloco: { carteira: null, indisponiveis: [{ nome: 'Espeto Gaúcho', motivo: 'passou do teto de tempo por cliente' }], foraDoOrcamento: [] },
    }
  })
})

describe('gerarRelatorioSemanal · a gravação não espera a medida da copy', () => {
  it('grava a semana, mede a copy e só então atualiza o metricsJson', async () => {
    const r = await gerarRelatorioSemanal({ referencia })
    expect(dubles.ordem).toEqual(['upsert', 'medir', 'update'])
    expect(r.gravados).toBe(1)
    const dados = dubles.db.instagramWeeklyReport.update.mock.calls[0][0].data
    expect(dados.metricsJson.copy.indisponivel).toBe('passou do teto de tempo por cliente')
  })

  it('a medida que falha inteira não tira a semana gravada nem o relatório', async () => {
    dubles.medir.mockImplementation(async () => {
      dubles.ordem.push('medir')
      throw new Error('pool esgotado')
    })
    const r = await gerarRelatorioSemanal({ referencia })
    expect(dubles.ordem).toEqual(['upsert', 'medir'])
    expect(r.gravados).toBe(1)
    // Varredura (d) do PR15-11: a falha geral não some da mensagem — silêncio leria como "nenhuma peça".
    expect(r.mensagem).toMatch(/Copy da semana.*medida indisponível/)
  })

  it('cliente cuja gravação falhou não recebe o update da copy (não existe linha para atualizar)', async () => {
    dubles.db.instagramWeeklyReport.upsert.mockRejectedValue(new Error('timeout'))
    const r = await gerarRelatorioSemanal({ referencia })
    expect(r.gravados).toBe(0)
    expect(dubles.db.instagramWeeklyReport.update).not.toHaveBeenCalled()
  })

  it('o update da copy que falha é só log', async () => {
    dubles.db.instagramWeeklyReport.update.mockRejectedValue(new Error('conexão caiu'))
    const r = await gerarRelatorioSemanal({ referencia })
    expect(r.gravados).toBe(1)
  })

  it('PR15-11 · os avisos de leitura incompleta da copy chegam à mensagem, na seção do cliente', async () => {
    const avisos = [
      '2 arte(s) ligada(s) direto aos posts são de antes do limite de 60 dias do histórico: as outras artes das páginas delas, dessa época, não foram lidas — a medida dessas peças pode estar incompleta',
      'a leitura parou no teto de 2000 sinais ligados — pode haver mais, e a medida olhou só os primeiros',
    ]
    dubles.medir.mockImplementation(async () => ({
      porCliente: new Map([[6, { projectId: 6, nome: 'Espeto Gaúcho', qualidade: medirQualidadeDaCopy([]), medidas: [], indisponivel: null, avisos }]]),
      carteira: null,
      bloco: { carteira: null, indisponiveis: [], foraDoOrcamento: [] },
    }))
    const { mensagem } = await gerarRelatorioSemanal({ referencia })
    const inicioDoCliente = mensagem.indexOf('*Espeto Gaúcho*')
    const fimDaCarteira = mensagem.indexOf('_Colhido no fecho')
    expect(inicioDoCliente).toBeGreaterThanOrEqual(0)
    for (const a of avisos) {
      const onde = mensagem.indexOf(a)
      expect(onde).toBeGreaterThan(inicioDoCliente)
      expect(onde).toBeLessThan(fimDaCarteira)
    }
  })
})
