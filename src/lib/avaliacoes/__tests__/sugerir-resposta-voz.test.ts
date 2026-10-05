import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * PR7-FINAL-02 (revisão final do Codex, 18/09/2026): os rascunhos de resposta
 * cortavam a identidade em 1.200 caracteres. A voz compacta validada vai até
 * 4.000 e as regras recentes moram no FIM — o corte apagava justamente elas.
 * `generateObject` é interceptado: o prompt conferido é o que iria ao modelo.
 */

const dubles = vi.hoisted(() => ({ loadBrandContext: vi.fn(), generateObject: vi.fn() }))
vi.mock('ai', () => ({ generateObject: dubles.generateObject }))
vi.mock('@ai-sdk/openai', () => ({ openai: () => 'modelo' }))
vi.mock('@/lib/brand/brand-context', () => ({ loadBrandContext: dubles.loadBrandContext }))
vi.mock('@/lib/db', () => ({ db: { knowledgeBaseEntry: { findMany: async () => [] } } }))
vi.mock('@/lib/knowledge/search', () => ({ searchKnowledgeBase: async () => [] }))

const { sugerirRespostaDeAvaliacao, sugerirRespostaDeComentario } = await import('../sugerir-resposta')
const { carregarMarcaParaRevisao, limparCacheDeRevisao, montarPrompt } = await import('@/lib/ai/revisao-ortografica')

const REGRA = 'Nunca prometer mesa sem reserva confirmada'
const textoLongo = `COMO A MARCA FALA: ${'direto e caloroso, fala de dono de casa. '.repeat(40)}\n\nRegras recentes (decisão da casa, vencem o resto):\n- ${REGRA} (17/09/2026 — reclamação no Google)`

function brand(fonte: 'voz' | 'legado') {
  return { projectName: 'Espeto Gaúcho', cuisineType: null, colors: [], dna: { toneOfVoice: textoLongo, contentRules: null, composition: null, visualStyle: null, photoDirection: null }, voz: { fonte, texto: textoLongo, regrasDaMarca: null, versao: fonte === 'voz' ? 4 : null, migradaEm: null, vozPendente: false, regrasDeArte: null, vocabulario: 'direto' } }
}

const promptEnviado = () => String(dubles.generateObject.mock.calls.at(-1)?.[0]?.prompt ?? '')

describe('a voz compacta chega inteira aos rascunhos de resposta (PR7-FINAL-02)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    dubles.generateObject.mockResolvedValue({ object: { resposta: 'Oi, obrigado pela visita! Equipe Espeto Gaúcho' } })
    expect(textoLongo.length).toBeGreaterThan(1200)
    expect(textoLongo.indexOf(REGRA)).toBeGreaterThan(1200)
  })

  it('avaliação: cliente migrado recebe a regra depois do caractere 1.200', async () => {
    dubles.loadBrandContext.mockResolvedValue(brand('voz'))
    await sugerirRespostaDeAvaliacao({ projectId: 6, nomeCliente: 'Espeto Gaúcho', estrelas: 2, texto: 'Demorou', autor: 'Ana' })
    expect(promptEnviado()).toContain(REGRA)
  })

  it('comentário: cliente migrado recebe a regra depois do caractere 1.200', async () => {
    dubles.loadBrandContext.mockResolvedValue(brand('voz'))
    await sugerirRespostaDeComentario({ projectId: 6, nomeCliente: 'Espeto Gaúcho', autor: 'Ana', texto: 'Tem mesa hoje?' })
    expect(promptEnviado()).toContain(REGRA)
  })

  it('controle: no legado o corte de 1.200 continua (toneOfVoice não tem o teto do contrato)', async () => {
    dubles.loadBrandContext.mockResolvedValue(brand('legado'))
    await sugerirRespostaDeAvaliacao({ projectId: 6, nomeCliente: 'Espeto Gaúcho', estrelas: 5, texto: 'Ótimo', autor: 'Ana' })
    expect(promptEnviado()).not.toContain(REGRA)
  })

  it('revisão ortográfica (mesma classe): a voz migrada chega inteira ao prompt', async () => {
    limparCacheDeRevisao()
    dubles.loadBrandContext.mockResolvedValue(brand('voz'))
    const marca = await carregarMarcaParaRevisao(6)
    expect(montarPrompt(marca!, { blocos: ['Costela no bafo'] })).toContain(REGRA)
  })
})
