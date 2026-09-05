import { describe, expect, it } from 'vitest'
import { ehModoDaMelhoria, modoPadraoDaMelhoria, MODOS_DA_MELHORIA, ROTULO_DO_MODO } from '../modo-da-melhoria'
import { qualidadePadraoPara } from '../qualidade-arte'
import { copyEstaNoPrompt, fontesForaDaReferencia } from '../diretor-de-arte'

describe('modoPadraoDaMelhoria — o padrão sai da origem da arte', () => {
  it('melhoria anterior → refinar (a pessoa está iterando a mesma peça)', () => {
    expect(modoPadraoDaMelhoria({ source: 'ai_improvement', ehMelhoria: true })).toBe('refinar')
    expect(modoPadraoDaMelhoria({ ehMelhoria: true })).toBe('refinar')
  })

  it('diagramação aprovada (compositor, canvas, mídia de post) → rediagramar', () => {
    for (const source of ['compositor', 'arte-enviada', 'post-midia', 'post-schedule']) {
      expect(modoPadraoDaMelhoria({ source })).toBe('rediagramar')
    }
  })

  it('export do editor (sem fieldValues), arte-rapida, ajuste-arte, arte-ia → redesenhar', () => {
    expect(modoPadraoDaMelhoria({})).toBe('redesenhar')
    expect(modoPadraoDaMelhoria({ source: null })).toBe('redesenhar')
    for (const source of ['arte-rapida', 'ajuste-arte', 'arte-livre', 'arte-ia']) {
      expect(modoPadraoDaMelhoria({ source })).toBe('redesenhar')
    }
  })

  it('todo modo tem rótulo em português, sem jargão', () => {
    for (const modo of MODOS_DA_MELHORIA) {
      const r = ROTULO_DO_MODO[modo]
      expect(r.titulo.length).toBeGreaterThan(3)
      expect(r.descricao).not.toMatch(/prompt|gpt|DRAFT|SCHEDULED/i)
    }
    expect(ehModoDaMelhoria('refinar')).toBe(true)
    expect(ehModoDaMelhoria('qualquer')).toBe(false)
  })
})

describe('qualidadePadraoPara com modo', () => {
  it('redesenhar sobe para medium; rediagramar e refinar ficam no low; ajuste na foto vence tudo', () => {
    expect(qualidadePadraoPara({ temAjusteDeFoto: false, modo: 'redesenhar' })).toBe('medium')
    expect(qualidadePadraoPara({ temAjusteDeFoto: false, modo: 'rediagramar' })).toBe('low')
    expect(qualidadePadraoPara({ temAjusteDeFoto: false, modo: 'refinar' })).toBe('low')
    expect(qualidadePadraoPara({ temAjusteDeFoto: false })).toBe('low')
    expect(qualidadePadraoPara({ temAjusteDeFoto: true, modo: 'redesenhar' })).toBe('high')
  })
})

describe('copyEstaNoPrompt — a conferência mecânica do prompt planejado', () => {
  it('aceita a copy verbatim a menos de caixa, acento e espaços', () => {
    const prompt = 'Render EXACTLY these blocks:\n"Horário Especial Feriado"\n"Domingo - 13h às 23h30"'
    expect(copyEstaNoPrompt(prompt, ['HORARIO ESPECIAL FERIADO', 'Domingo -  13h às 23h30'])).toEqual([])
  })

  it('devolve o bloco que o planejador esqueceu ou reescreveu', () => {
    const prompt = 'Render EXACTLY these blocks:\n"Horário Especial Feriado"'
    expect(copyEstaNoPrompt(prompt, ['Horário Especial Feriado', 'Quarta - Fechado'])).toEqual(['Quarta - Fechado'])
    expect(copyEstaNoPrompt('"Horario Especial de Feriado"', ['Horário Especial Feriado'])).toEqual(['Horário Especial Feriado'])
  })
})

describe('fontesForaDaReferencia — nome de fonte vira texto desenhado', () => {
  const fontes = ['DomaniCP', 'Amithen', 'Acumin Pro Book']

  it('acusa o nome de fonte na frase da tarefa (o caso "Amithen" do Quintal, 05/09/2026)', () => {
    const prompt = 'Headline is stacked: line 1 in DomaniCP (Title Case), line 2 in Amithen (larger).\nImage 4 is the type specimen of Amithen and DomaniCP.'
    expect(fontesForaDaReferencia(prompt, fontes).sort()).toEqual(['amithen', 'domanicp'])
  })

  it('aceita o nome na linha da referência e dentro da copy entre aspas', () => {
    const prompt = 'Use the display serif from Image 4 for "Happy hour".\nImage 4 is the type specimen: Amithen for the script line, Acumin Pro for the rest.\n"Noite Amithen no bar"'
    expect(fontesForaDaReferencia(prompt, fontes)).toEqual([])
  })

  it('família curta demais não é procurada (evita falso positivo com palavra comum)', () => {
    expect(fontesForaDaReferencia('line 1 in Ace', ['Ace'])).toEqual([])
  })
})
