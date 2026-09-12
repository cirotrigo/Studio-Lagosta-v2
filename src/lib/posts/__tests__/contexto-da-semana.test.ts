import { describe, expect, it } from 'vitest'
import { chaveDoSlot, dataValida, diaDaSemanaDe, formatoDoBloco, formatoDoSlotDaPeca, formatoDoTipo, historicoParaFormato, janelaDaSugestao, montarGradeDaSemana, slotOcupado, slotsParaAPeca, TETO_DE_DIAS_DA_JANELA } from '../contexto-da-semana'
import { fundirGradeComCadencia } from '../grade-da-base'

// quinta 17/09/2026, 10:00 em Brasília
const AGORA = new Date('2026-09-17T13:00:00.000Z')

describe('a janela da sugestão (início e fim em Brasília)', () => {
  it('sem início nem fim: hoje + dias (o comportamento de sempre)', () => {
    const j = janelaDaSugestao({ agora: AGORA })
    expect(j.inicioISO).toBe('2026-09-17')
    expect(j.fimISO).toBe('2026-09-23')
    expect(j.datas).toHaveLength(7)
    expect(j.inicio).toBe(AGORA)
    expect(j.avisos).toEqual([])
  })
  it('a semana que vem: segunda a domingo, sete datas, fim no último instante do domingo', () => {
    const j = janelaDaSugestao({ agora: AGORA, inicio: '2026-09-21', fim: '2026-09-27' })
    expect(j.datas).toEqual(['2026-09-21', '2026-09-22', '2026-09-23', '2026-09-24', '2026-09-25', '2026-09-26', '2026-09-27'])
    expect(j.inicio.toISOString()).toBe('2026-09-21T03:00:00.000Z')
    expect(j.fim.toISOString()).toBe('2026-09-28T02:59:59.999Z')
  })
  it('início no passado vira hoje, com aviso; fim antes do início é erro; além do teto é cortada', () => {
    const j = janelaDaSugestao({ agora: AGORA, inicio: '2026-09-10', fim: '2026-09-19' })
    expect(j.inicioISO).toBe('2026-09-17')
    expect(j.avisos[0]).toMatch(/já passou/)
    expect(() => janelaDaSugestao({ agora: AGORA, inicio: '2026-09-21', fim: '2026-09-20' })).toThrow(/vem antes/)
    const longa = janelaDaSugestao({ agora: AGORA, inicio: '2026-09-21', fim: '2026-12-31' })
    expect(longa.datas).toHaveLength(TETO_DE_DIAS_DA_JANELA)
    expect(longa.avisos[0]).toMatch(/cortada/)
    expect(() => janelaDaSugestao({ agora: AGORA, inicio: '2026-02-31' })).toThrow(/inválido/)
  })
  it('dia que NÃO existe é recusado, não normalizado: 31/02, 31/04 e 29/02 fora de bissexto', () => {
    expect(dataValida('2026-02-31')).toBe(false)
    expect(dataValida('2026-04-31')).toBe(false)
    expect(dataValida('2027-02-29')).toBe(false)
    expect(dataValida('2028-02-29')).toBe(true)
    expect(dataValida('2026-09-21')).toBe(true)
    expect(dataValida('21/09/2026')).toBe(false)
    expect(dataValida(null)).toBe(false)
    expect(() => janelaDaSugestao({ agora: AGORA, inicio: '2026-02-31' })).toThrow(/inválido/)
    expect(() => janelaDaSugestao({ agora: AGORA, inicio: '2026-09-21', fim: '2026-09-31' })).toThrow(/inválido/)
  })
  it('dias é ignorado quando fim vem; sem fim, dias conta a partir do início', () => {
    expect(janelaDaSugestao({ agora: AGORA, inicio: '2026-09-21', dias: 3 }).datas).toEqual(['2026-09-21', '2026-09-22', '2026-09-23'])
    expect(janelaDaSugestao({ agora: AGORA, inicio: '2026-09-21', fim: '2026-09-22', dias: 10 }).datas).toHaveLength(2)
  })
})

describe('formato e ocupação por formato', () => {
  it('story é story; post, carrossel e reel disputam o feed', () => {
    expect(formatoDoTipo('STORY')).toBe('story')
    expect(formatoDoTipo('POST')).toBe('feed')
    expect(formatoDoTipo('CAROUSEL')).toBe('feed')
    expect(formatoDoTipo('REEL')).toBe('feed')
  })
  it('o horário típico leva o formato da MAIORIA do bloco; empate e bloco vazio caem em story', () => {
    const quinta19 = (min: number, postType: string) => ({ quando: new Date(`2026-09-10T${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}:00-03:00`), postType })
    const historico = [quinta19(19 * 60, 'POST'), quinta19(19 * 60 + 10, 'CAROUSEL'), quinta19(19 * 60 + 20, 'STORY'), quinta19(12 * 60, 'STORY')]
    expect(formatoDoBloco(historico, 4, 19 * 60)).toBe('feed')
    expect(formatoDoBloco(historico, 4, 12 * 60)).toBe('story')
    expect(formatoDoBloco(historico, 4, 8 * 60)).toBe('story')
    expect(formatoDoBloco([quinta19(19 * 60, 'POST'), quinta19(19 * 60 + 5, 'STORY')], 4, 19 * 60)).toBe('story')
  })
  it('o formato olha o MESMO bloco que criou o horário: feeds às 19h20 formam o horário das 19h30 (round), e é feed', () => {
    const quinta = (min: number, postType: string) => ({ quando: new Date(`2026-09-10T${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}:00-03:00`), postType })
    const historico = [quinta(19 * 60 + 20, 'POST'), quinta(19 * 60 + 20, 'POST'), quinta(19 * 60 + 25, 'CAROUSEL')]
    // a cadência arredonda 19h20 para o bloco das 19h30 (blocoDeMinutos); com floor o bloco das 19h30 estaria vazio e cairia em story
    expect(formatoDoBloco(historico, 4, 19 * 60 + 30)).toBe('feed')
    expect(formatoDoBloco(historico, 4, 19 * 60)).toBe('story')
  })
  it('campanha encerrada NÃO decide o formato: os feeds dela saem da população antes da contagem', () => {
    const quinta = (min: number, postType: string, campaignId: string | null = null) => ({ scheduledDatetime: new Date(`2026-09-10T${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}:00-03:00`), postType, campaignId })
    const historico = [quinta(12 * 60, 'STORY'), quinta(12 * 60 + 5, 'STORY'), quinta(12 * 60, 'POST', 'camp-x'), quinta(12 * 60 + 10, 'POST', 'camp-x'), quinta(12 * 60 + 12, 'POST', 'camp-x'), { scheduledDatetime: null, postType: 'POST', campaignId: null }]
    expect(formatoDoBloco(historicoParaFormato(historico, new Set(['camp-x'])), 4, 12 * 60)).toBe('story')
    expect(formatoDoBloco(historicoParaFormato(historico, new Set()), 4, 12 * 60)).toBe('feed')
    expect(historicoParaFormato(historico, new Set(['camp-x']))).toHaveLength(2)
  })
  it('a peça vê só os slots do SEU formato, e a reserva é por horário E formato (R22): story existente + slot livre de feed no mesmo horário não vira sugestão para outro story', () => {
    const sugestoes = [
      { scheduledDatetime: '2026-09-21 18:00', formato: 'feed' as const },
      { scheduledDatetime: '2026-09-21 19:00', formato: 'story' as const },
      { scheduledDatetime: '2026-09-22 09:00' }, // resposta antiga, sem formato = story
    ]
    expect(formatoDoSlotDaPeca('story')).toBe('story')
    expect(formatoDoSlotDaPeca('feed')).toBe('feed')
    expect(formatoDoSlotDaPeca('quadrado')).toBe('feed')
    expect(formatoDoSlotDaPeca('carrossel')).toBe('feed')
    // peça story: o feed das 18h não aparece; o story das 19h e o slot antigo sim
    expect(slotsParaAPeca(sugestoes, 'story', new Set()).map((s) => s.scheduledDatetime)).toEqual(['2026-09-21 19:00', '2026-09-22 09:00'])
    // peça feed/carrossel: só o feed das 18h
    expect(slotsParaAPeca(sugestoes, 'quadrado', new Set()).map((s) => s.scheduledDatetime)).toEqual(['2026-09-21 18:00'])
    // a fila com um STORY às 19h não reserva o feed das 19h — e reserva o story
    const reservados = new Set([chaveDoSlot('2026-09-21 19:00', 'story')])
    expect(slotsParaAPeca(sugestoes, 'story', reservados).map((s) => s.scheduledDatetime)).toEqual(['2026-09-22 09:00'])
    expect(slotsParaAPeca([{ scheduledDatetime: '2026-09-21 19:00', formato: 'feed' as const }], 'feed', reservados)).toHaveLength(1)
  })
  it('um feed às 19h NÃO ocupa o story das 19h; o mesmo formato a 45 min ocupa', () => {
    const t = new Date('2026-09-24T19:00:00-03:00').getTime()
    const ocupados = [{ t, formato: 'feed' as const }]
    expect(slotOcupado(ocupados, t, 'story', 45)).toBe(false)
    expect(slotOcupado(ocupados, t + 30 * 60_000, 'feed', 45)).toBe(true)
    expect(slotOcupado(ocupados, t + 46 * 60_000, 'feed', 45)).toBe(false)
  })
  it('diaDaSemanaDe lê a data em Brasília', () => {
    expect(diaDaSemanaDe('2026-09-21')).toBe(1)
    expect(diaDaSemanaDe('2026-09-27')).toBe(0)
  })
})

describe('a grade completa da semana', () => {
  it('os 7 dias, com origem (combinado · histórico · nova), formato e evidência; dias vazios viram exceções', () => {
    const cadencia = new Map([
      [4, [{ minutosDoDia: 19 * 60, hora: '19:00', motivo: 'rotina', picoRecente: false, apoioFraco: false }]],
      [5, [{ minutosDoDia: 12 * 60, hora: '12:00', motivo: 'campanha', picoRecente: false, apoioFraco: true }, { minutosDoDia: 18 * 60, hora: '18:00', motivo: 'novidade', picoRecente: true, apoioFraco: false }]],
    ])
    const grade = [{ hora: '11:00', dias: [1, 2], origem: 'grade' as const, linha: 'seg e ter 11h: almoço', tema: 'almoço' }]
    const fundido = fundirGradeComCadencia(cadencia, grade)
    expect(fundido.get(5)?.map((s) => [s.hora, s.novidade ?? false, s.evidenciaFraca ?? false])).toEqual([
      ['12:00', false, true],
      ['18:00', true, false],
    ])
    const { grade: semana, excecoes } = montarGradeDaSemana(fundido, (dia, slot) => (slot.origem === 'grade' ? 'story' : dia === 4 ? 'feed' : 'story'))
    expect(semana).toHaveLength(7)
    expect(excecoes).toEqual(['domingo', 'quarta', 'sábado'])
    expect(semana[1].horarios).toEqual([{ hora: '11:00', formato: 'story', origem: 'combinado', evidenciaFraca: false, tema: 'almoço', motivo: 'grade aprovada do cliente: seg e ter 11h: almoço' }])
    expect(semana[4].horarios[0]).toMatchObject({ hora: '19:00', formato: 'feed', origem: 'historico', evidenciaFraca: false })
    expect(semana[5].horarios.map((h) => [h.hora, h.origem, h.evidenciaFraca])).toEqual([
      ['12:00', 'historico', true],
      ['18:00', 'nova', true],
    ])
  })
})
