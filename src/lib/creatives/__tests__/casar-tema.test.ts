/**
 * O casamento de tema com tag, apertado depois do caso real de 01/09/2026:
 * `escolher-modelo("funcionamento")` no O Quintal Parrilla devolvia
 * "Celebrações Especiais" — sem modelo de funcionamento, o fallback só-dia
 * casava "quinta" com "Quintal" e entregava a primeira página do cliente.
 */
import { describe, expect, it } from 'vitest'

import { casaDiaComNome, casaTemaComTags, normalizarTema } from '../casar-tema'

const TAGS_DO_QUINTAL = ['celebracoes', 'lote-tema-2026-08', 'happy-hour', 'parrilla', 'petiscos', 'resenha']

describe('casaTemaComTags', () => {
  it('"funcionamento" não casa com as tags do Quintal', () => {
    expect(casaTemaComTags('funcionamento', ['celebracoes', 'lote-tema-2026-08'])).toBe(false)
    expect(casaTemaComTags('funcionamento', TAGS_DO_QUINTAL)).toBe(false)
  })

  it('"happy hour" casa com ["happy-hour"]', () => {
    expect(casaTemaComTags('happy hour', ['happy-hour'])).toBe(true)
    expect(casaTemaComTags('Happy Hour', TAGS_DO_QUINTAL)).toBe(true)
  })

  it('"almoço executivo" casa com ["almoco-executivo"]', () => {
    expect(casaTemaComTags('almoço executivo', ['almoco-executivo'])).toBe(true)
    // Uma palavra do tema com 4+ letras é prefixo da tag.
    expect(casaTemaComTags('almoço', ['almoco-executivo'])).toBe(true)
    // …e também de um token interno da tag.
    expect(casaTemaComTags('executivo', ['almoco-executivo'])).toBe(true)
  })

  it('"hh" não casa com nada', () => {
    expect(casaTemaComTags('hh', ['happy-hour'])).toBe(false)
    expect(casaTemaComTags('hh', TAGS_DO_QUINTAL)).toBe(false)
    expect(casaTemaComTags('hh', [])).toBe(false)
  })

  it('palavra curta (≤ 3 letras) nunca casa por prefixo, só o tema inteiro igual à tag', () => {
    expect(casaTemaComTags('pra', ['parrilla', 'pratos'])).toBe(false)
    expect(casaTemaComTags('pra', ['pra'])).toBe(true)
  })

  it('substring no meio da tag NÃO casa (nada de tag.includes)', () => {
    // "amento" está dentro de "funcionamento", mas não é prefixo de nada.
    expect(casaTemaComTags('amento', ['funcionamento'])).toBe(false)
    // …e a tag dentro do tema também não conta (nada de tema.includes(tag)).
    expect(casaTemaComTags('funcionamento do quintal', ['tal'])).toBe(false)
  })

  it('tema vazio ou sem tags não casa', () => {
    expect(casaTemaComTags('', ['happy-hour'])).toBe(false)
    expect(casaTemaComTags('   ', ['happy-hour'])).toBe(false)
    expect(casaTemaComTags('happy hour', [])).toBe(false)
  })
})

describe('casaDiaComNome', () => {
  it('"quinta" NÃO casa com "O Quintal Parrilla — Celebrações Especiais (3 layouts)"', () => {
    expect(casaDiaComNome('O Quintal Parrilla — Celebrações Especiais (3 layouts)', 'quinta')).toBe(false)
    expect(casaDiaComNome('O Quintal Parrilla — Celebrações Especiais (3 layouts)', 'quinta-feira')).toBe(false)
  })

  it('casa por token: "Quinta-feira", "By Rock — Quinta", "Segunda-feira"', () => {
    expect(casaDiaComNome('Quinta-feira', 'quinta')).toBe(true)
    expect(casaDiaComNome('By Rock — Quinta', 'quinta-feira')).toBe(true)
    expect(casaDiaComNome('Segunda-feira', 'Segunda')).toBe(true)
    expect(casaDiaComNome('Sábado — happy hour', 'sabado')).toBe(true)
  })

  it('nome vazio ou dia vazio não casam', () => {
    expect(casaDiaComNome(null, 'quinta')).toBe(false)
    expect(casaDiaComNome('Quinta-feira', '')).toBe(false)
  })
})

describe('normalizarTema', () => {
  it('minúsculas, sem acento, espaços viram hífen', () => {
    expect(normalizarTema('Almoço Executivo')).toBe('almoco-executivo')
    expect(normalizarTema('  happy   hour ')).toBe('happy-hour')
  })
})
