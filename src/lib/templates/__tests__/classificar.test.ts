import { describe, it, expect } from 'vitest'
import { agruparTemplates, chaveDaSemana, formatoDaPasta, secaoDoTemplate, templateVisivel } from '../classificar'

const t = (name: string, extra: Record<string, unknown> = {}) => ({ id: Math.random(), name, _count: { Page: 1 }, ...extra })

describe('secaoDoTemplate', () => {
  it('classifica pelas pistas que o banco já tem', () => {
    expect(secaoDoTemplate(t('Assinatura', { category: 'assinatura' }))).toBe('assinatura')
    expect(secaoDoTemplate(t('Semana 7 a 13/09', { category: 'programacao', tags: ['programacao', 'semana:2026-09-07'] }))).toBe('programacao')
    expect(secaoDoTemplate(t('Avulsas · setembro', { category: 'avulsas' }))).toBe('programacao')
    expect(secaoDoTemplate(t('Arte Composta — Feed', { category: 'arte-rapida' }))).toBe('arquivo')
    expect(secaoDoTemplate(t('Arte IA'))).toBe('arquivo')
    expect(secaoDoTemplate(t('O Quintal Parrilla — Happy Hour (3 layouts)', { tags: ['happy-hour', 'lote-tema-2026-08'] }))).toBe('arquivo')
    expect(secaoDoTemplate(t('Página 1', { category: '__system_konva_export__' }))).toBe('arquivo')
    expect(secaoDoTemplate(t('Sábado'))).toBe('equipe')
    expect(secaoDoTemplate(t('Prêmio HZ Gastrô 2026 - Impresso de mesa', { category: 'impresso' }))).toBe('equipe')
  })
  it('coletor vazio some; modelo vazio da equipe fica', () => {
    expect(templateVisivel(t('Arte IA', { _count: { Page: 0 } }))).toBe(false)
    expect(templateVisivel(t('Novo modelo', { _count: { Page: 0 } }))).toBe(true)
  })
  it('pasta da semana esvaziada pela separação não deixa card fantasma', () => {
    const vazia = { category: 'programacao', tags: ['programacao', 'semana:2026-09-07'], _count: { Page: 0 } }
    expect(templateVisivel(t('Semana 7 a 13/09', vazia))).toBe(false)
    expect(templateVisivel(t('Stories · Semana 7 a 13/09', { ...vazia, tags: ['programacao', 'semana:2026-09-07', 'semana:2026-09-07:story'], _count: { Page: 21 } }))).toBe(true)
  })
})

describe('a semana e o formato saem das tags', () => {
  it('a chave da semana casa a tag com e sem formato, em qualquer ordem do array', () => {
    expect(chaveDaSemana(t('velha', { tags: ['programacao', 'semana:2026-09-07'] }))).toBe('2026-09-07')
    expect(chaveDaSemana(t('nova', { tags: ['programacao', 'semana:2026-09-07', 'semana:2026-09-07:story'] }))).toBe('2026-09-07')
    expect(chaveDaSemana(t('só com formato', { tags: ['semana:2026-09-07:feed'] }))).toBe('2026-09-07')
    expect(chaveDaSemana(t('modelo da equipe', { tags: ['happy-hour'] }))).toBeNull()
  })
  it('o formato vem do sufixo da tag-chave', () => {
    expect(formatoDaPasta(t('x', { tags: ['semana:2026-09-07', 'semana:2026-09-07:story'] }))).toBe('story')
    expect(formatoDaPasta(t('x', { tags: ['mes:2026-09', 'mes:2026-09:feed'] }))).toBe('feed')
    expect(formatoDaPasta(t('pasta antiga, mista', { tags: ['semana:2026-09-07'] }))).toBeNull()
  })
})

describe('agruparTemplates', () => {
  it('semana mais recente primeiro, avulsas no fim', () => {
    const g = agruparTemplates([
      t('Semana 7 a 13/09', { category: 'programacao', tags: ['semana:2026-09-07'] }),
      t('Avulsas · setembro', { category: 'avulsas', tags: ['mes:2026-09'] }),
      t('Semana 14 a 20/09', { category: 'programacao', tags: ['semana:2026-09-14'] }),
      t('Sábado'),
      t('Domingo'),
    ])
    expect(g.programacao.map((x) => x.name)).toEqual(['Semana 14 a 20/09', 'Semana 7 a 13/09', 'Avulsas · setembro'])
    expect(g.equipe.map((x) => x.name)).toEqual(['Domingo', 'Sábado'])
  })

  it('as duas pastas da mesma semana ficam juntas, Stories antes de Feed', () => {
    const pasta = (name: string, tags: string[]) => t(name, { category: 'programacao', tags })
    // Entram fora de ordem de propósito: o desempate não pode depender da
    // ordem de chegada nem do nome.
    const g = agruparTemplates([
      pasta('Feed · Semana 7 a 13/09', ['semana:2026-09-07', 'semana:2026-09-07:feed']),
      pasta('Stories · Semana 31/08 a 6/09', ['semana:2026-08-31', 'semana:2026-08-31:story']),
      pasta('Stories · Semana 7 a 13/09', ['semana:2026-09-07', 'semana:2026-09-07:story']),
      pasta('Feed · Semana 31/08 a 6/09', ['semana:2026-08-31', 'semana:2026-08-31:feed']),
    ])
    expect(g.programacao.map((x) => x.name)).toEqual([
      'Stories · Semana 7 a 13/09',
      'Feed · Semana 7 a 13/09',
      'Stories · Semana 31/08 a 6/09',
      'Feed · Semana 31/08 a 6/09',
    ])
  })
})
