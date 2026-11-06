import { describe, expect, it } from 'vitest'
import {
  chipsDeTema,
  ehDaAssinatura,
  ehTagTecnica,
  filtrarEOrdenar,
  formatosPresentes,
  rotuloDeUso,
  tagsDeTema,
  type ModeloDaVitrine,
} from '../vitrine'

const m = (p: Partial<ModeloDaVitrine> & { id: string }): ModeloDaVitrine => ({
  name: p.id,
  tags: [],
  templateName: 'By Rock — Modelos · Story',
  formato: 'story',
  usedCount: 0,
  lastUsedAt: null,
  ...p,
})

describe('tags técnicas', () => {
  it('esconde formato, marcas do sistema e os prefixos', () => {
    for (const t of [
      'story',
      'Feed',
      'quadrado',
      'assinatura',
      'layout',
      'compositor',
      'de-modelo',
      'fora-do-rodizio',
      'lote-tema-2026-08',
      'semana:2026-11-02:story',
      'arquetipo:base-centro',
    ]) {
      expect(ehTagTecnica(t), t).toBe(true)
    }
    expect(ehTagTecnica('happy-hour')).toBe(false)
    expect(tagsDeTema(m({ id: 'a', tags: ['story', 'happy-hour', 'semana:2026-11-02', 'drinks'] }))).toEqual([
      'happy-hour',
      'drinks',
    ])
  })
})

describe('chips', () => {
  const modelos = [
    m({ id: 'a', tags: ['story', 'drinks', 'happy-hour'] }),
    m({ id: 'b', tags: ['almoco-executivo', 'compositor'], formato: 'feed' }),
    m({ id: 'c', tags: ['delivery', 'happy-hour'] }),
  ]

  it('tema: pilares primeiro na ordem deles, só os presentes, o resto em ordem alfabética', () => {
    expect(chipsDeTema(modelos, ['happy-hour', 'musica-ao-vivo', 'almoco-executivo'])).toEqual([
      'happy-hour',
      'almoco-executivo',
      'delivery',
      'drinks',
    ])
    expect(chipsDeTema(modelos)).toEqual(['almoco-executivo', 'delivery', 'drinks', 'happy-hour'])
  })

  it('formato: só os que existem, na ordem fixa', () => {
    expect(formatosPresentes(modelos)).toEqual(['story', 'feed'])
  })
})

describe('filtrarEOrdenar', () => {
  const modelos = [
    m({ id: 'nunca-b', name: 'Bebidas' }),
    m({ id: 'velho', name: 'Almoço Executivo', lastUsedAt: '2026-10-01T12:00:00Z', usedCount: 3, tags: ['almoco-executivo'] }),
    m({ id: 'novo', name: 'Happy Hour', lastUsedAt: '2026-11-05T12:00:00Z', usedCount: 12, tags: ['happy-hour'] }),
    m({ id: 'nunca-a', name: 'Agenda musical', formato: 'feed', tags: ['musica-ao-vivo'] }),
  ]

  it('usados recentemente primeiro, nunca usados por último (pelo nome)', () => {
    expect(filtrarEOrdenar(modelos).map((x) => x.id)).toEqual(['novo', 'velho', 'nunca-a', 'nunca-b'])
  })

  it('não muda a lista recebida', () => {
    const antes = modelos.map((x) => x.id)
    filtrarEOrdenar(modelos)
    expect(modelos.map((x) => x.id)).toEqual(antes)
  })

  it('busca no nome e nas tags, sem acento e sem caixa', () => {
    expect(filtrarEOrdenar(modelos, { busca: 'almoco' }).map((x) => x.id)).toEqual(['velho'])
    expect(filtrarEOrdenar(modelos, { busca: 'MUSICA' }).map((x) => x.id)).toEqual(['nunca-a'])
  })

  it('filtra por formato e por tema', () => {
    expect(filtrarEOrdenar(modelos, { formato: 'feed' }).map((x) => x.id)).toEqual(['nunca-a'])
    expect(filtrarEOrdenar(modelos, { tema: 'happy-hour' }).map((x) => x.id)).toEqual(['novo'])
    expect(filtrarEOrdenar(modelos, { formato: 'feed', tema: 'happy-hour' })).toEqual([])
  })
})

describe('Assinatura e uso', () => {
  it('pela pasta ou pela tag', () => {
    expect(ehDaAssinatura(m({ id: 'a', templateName: 'Assinatura' }))).toBe(true)
    expect(ehDaAssinatura(m({ id: 'b', tags: ['assinatura'] }))).toBe(true)
    expect(ehDaAssinatura(m({ id: 'c' }))).toBe(false)
  })

  it('rótulo de uso', () => {
    expect(rotuloDeUso(12)).toBe('usado 12×')
    expect(rotuloDeUso(0)).toBe('nunca usado')
  })
})
