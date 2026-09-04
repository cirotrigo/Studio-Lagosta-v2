import { describe, it, expect } from 'vitest'
import { agruparTemplates, secaoDoTemplate, templateVisivel } from '../classificar'

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
})
