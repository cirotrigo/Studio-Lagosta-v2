import { describe, it, expect } from 'vitest'
import { horarioCurto, nomeDaPagina, ordemDaPagina, pastaDaPeca, semanaDe } from '../pasta-da-semana'

describe('semanaDe', () => {
  it('segunda a domingo em BRT, nome no mesmo mês', () => {
    const s = semanaDe(new Date('2026-09-10T12:00:00-03:00')) // quinta
    expect(s.chave).toBe('2026-09-07')
    expect(s.nome).toBe('Semana 7 a 13/09')
  })
  it('domingo 23:30 BRT ainda é da semana que termina nele', () => {
    const s = semanaDe(new Date('2026-09-13T23:30:00-03:00'))
    expect(s.chave).toBe('2026-09-07')
  })
  it('semana que cruza o mês leva os dois meses no nome', () => {
    const s = semanaDe(new Date('2026-09-30T10:00:00-03:00'))
    expect(s.nome).toBe('Semana 28/09 a 4/10')
  })
})

describe('pastaDaPeca', () => {
  it('com data vai para a semana; sem data, avulsas do mês', () => {
    expect(pastaDaPeca('2026-09-11T19:00:00-03:00', 'story').nome).toBe('Stories · Semana 7 a 13/09')
    const a = pastaDaPeca(null, 'feed', new Date('2026-09-03T10:00:00-03:00'))
    expect(a.nome).toBe('Feed · Avulsas · setembro')
    expect(a.chave).toBe('mes:2026-09:feed')
  })

  it('story e feed da mesma semana são pastas DIFERENTES, cada uma no seu tamanho', () => {
    const story = pastaDaPeca('2026-09-11T19:00:00-03:00', 'story')
    const feed = pastaDaPeca('2026-09-11T19:00:00-03:00', 'feed')
    expect(story.chave).toBe('semana:2026-09-07:story')
    expect(feed.chave).toBe('semana:2026-09-07:feed')
    expect(story.chave).not.toBe(feed.chave)
    expect([story.tipo, story.dimensoes]).toEqual(['STORY', '1080x1920'])
    expect([feed.tipo, feed.dimensoes]).toEqual(['FEED', '1080x1350'])
  })

  it('a tag da semana SEM formato continua nas tags — é por ela que se filtra a semana inteira', () => {
    const p = pastaDaPeca('2026-09-11T19:00:00-03:00', 'story')
    expect(p.tags).toContain('semana:2026-09-07')
    expect(p.tags).toContain('semana:2026-09-07:story')
    expect(p.chaveDoPeriodo).toBe('semana:2026-09-07')
  })
})

describe('ordemDaPagina', () => {
  it('ordena por dia e horário de POSTAGEM dentro da semana', () => {
    const terca09 = ordemDaPagina('2026-09-08T09:00:00-03:00')!
    const terca12 = ordemDaPagina('2026-09-08T12:00:00-03:00')!
    const quarta09 = ordemDaPagina('2026-09-09T09:00:00-03:00')!
    expect(terca09).toBeLessThan(terca12)
    expect(terca12).toBeLessThan(quarta09)
  })

  it('a segunda 00:00 é o zero da semana e o domingo 23:59 o teto', () => {
    expect(ordemDaPagina('2026-09-07T00:00:00-03:00')).toBe(0)
    expect(ordemDaPagina('2026-09-13T23:59:00-03:00')).toBe((6 * 1440 + 23 * 60 + 59) * 100)
  })

  it('slides do mesmo carrossel desempatam no mesmo minuto, em ordem', () => {
    const quando = '2026-09-09T19:30:00-03:00'
    const slides = [2, 3, 4, 5].map((s) => ordemDaPagina(quando, s)!)
    expect(slides).toEqual([...slides].sort((a, b) => a - b))
    expect(new Set(slides).size).toBe(4)
    // E um story do mesmo minuto (sem slide) vem antes de qualquer slide.
    expect(ordemDaPagina(quando)!).toBeLessThan(slides[0])
  })

  it('sem data não há ordem de postagem — quem chama cai em max+1', () => {
    expect(ordemDaPagina(null)).toBeNull()
    expect(ordemDaPagina('não é data')).toBeNull()
  })
})

describe('nomeDaPagina', () => {
  it('leva a DATA e a hora; o formato fica no nome da pasta', () => {
    expect(nomeDaPagina({ quando: '2026-09-10T09:00:00-03:00', tema: 'Empório Fonseca' })).toBe('Qui 10/09 · 09:00 · Empório Fonseca')
    expect(nomeDaPagina({ nome: 'Prova' })).toBe('Prova')
  })

  it('slide no nome — sem ele os irmãos do mesmo carrossel ficavam idênticos', () => {
    const nomes = [2, 3].map((slide) => nomeDaPagina({ quando: '2026-09-10T19:30:00-03:00', tema: 'Empório Fonseca', carrossel: { slide, de: 5 } }))
    expect(nomes[0]).toBe('Qui 10/09 · 19:30 · Empório Fonseca · slide 2/5')
    expect(nomes[0]).not.toBe(nomes[1])
  })

  it('sem slide declarado, irmão do mesmo minuto ganha "peça N" — nunca nome repetido', () => {
    const base = { quando: '2026-09-10T19:30:00-03:00', tema: 'Empório Fonseca' }
    const nomes = [1, 2, 3, 4].map((peca) => nomeDaPagina({ ...base, peca }))
    expect(nomes[0]).toBe('Qui 10/09 · 19:30 · Empório Fonseca')
    expect(nomes[1]).toBe('Qui 10/09 · 19:30 · Empório Fonseca · peça 2')
    expect(new Set(nomes).size).toBe(4)
  })

  it('o slide declarado VENCE o "peça N" — é a posição de verdade', () => {
    expect(nomeDaPagina({ quando: '2026-09-10T19:30:00-03:00', tema: 'Empório', carrossel: { slide: 2, de: 5 }, peca: 3 })).toBe('Qui 10/09 · 19:30 · Empório · slide 2/5')
  })

  it('sem o total, o slide sai sozinho', () => {
    expect(nomeDaPagina({ quando: '2026-09-10T19:30:00-03:00', tema: 'TERO', carrossel: { slide: 3 } })).toBe('Qui 10/09 · 19:30 · TERO · slide 3')
  })
})

describe('horarioCurto', () => {
  it('fala a MESMA língua do nome da página — é o horário que o botão Agendar promete', () => {
    const quando = '2026-09-10T19:30:00-03:00'
    expect(horarioCurto(quando)).toBe('Qui 10/09 · 19:30')
    // O prefixo do nome da página é exatamente isto; divergir seria mostrar
    // duas datas para a mesma peça, uma na faixa e outra no botão.
    expect(nomeDaPagina({ quando, tema: 'Empório' }).startsWith(horarioCurto(quando))).toBe(true)
  })

  it('lê ISO com fuso e converte para BRT', () => {
    // 12:00 UTC = 09:00 em Brasília.
    expect(horarioCurto('2026-09-08T12:00:00.000Z')).toBe('Ter 08/09 · 09:00')
  })

  it('data inválida ou ausente vira string vazia, nunca "Invalid Date"', () => {
    expect(horarioCurto(null)).toBe('')
    expect(horarioCurto('não é data')).toBe('')
  })
})
