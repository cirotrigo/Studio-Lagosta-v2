import { describe, expect, it } from 'vitest'
import { temTextoSubstantivo, temTextoVisivel, textoVisivel } from '../texto-visivel'

describe('texto visível × texto substantivo (CP4.1)', () => {
  it('visível: invisíveis e espaço não desenham; pontuação desenha', () => {
    for (const s of ['', '   ', '\u200b', '\u200c\u200d', '\u2060', '\u00ad', '\ufeff', '\u034f', '\u3164', '\uffa0', '\u2800', ' \u200b ', '\u115f', '\u1160', '\ufe0f', '\u115f\u1160', null, undefined]) expect(temTextoVisivel(s)).toBe(false)
    for (const s of ['.', '-', 'a', '1', '🍷']) expect(temTextoVisivel(s)).toBe(true)
    expect(textoVisivel(' a\u200bb ')).toBe('ab')
  })
  it('substantivo: só pontuação/símbolo NÃO é conteúdo (lista do owner)', () => {
    for (const s of ['.', '...', '-', '—', '___', '!!!', '()', '/', '•••', '…', '« »', '* * *', '~', '|', '\\', '"', "'", '¡¿', '§¶', '→', '≠', '', '   ', '\u200b', '\u2800']) expect(temTextoSubstantivo(s)).toBe(false)
    // Caça-bypass (15/10): fillers Hangul que são LETRAS (U+115F/U+1160), letras modificadoras (ʼ ʹ ˆ ː), os
    // pictogramas que também são pontuação/matemática (‼ ⁉ 〰 ↔) e as marcas © ® ™ não salvam uma copy.
    for (const s of ['\u115f', '\u1160', '\u115f\u1160', 'ʼ', 'ʹ', 'ˆ', 'ː', '‼', '⁉', '〰', '〽', '↔', '©', '®', '™', '©™']) expect(temTextoSubstantivo(s)).toBe(false)
  })
  it('substantivo: letra, número ou pictograma em qualquer escrita É conteúdo (lista do owner)', () => {
    for (const s of ['Almoço', '11h30', 'R$ 79', '50%', 'Vem!', '🍷', '☕', '❤', '🇧🇷', '½', '²', 'الغداء', '午餐', 'Обед', 'ñ', 'a.', '.1', '(x)', ' \u200b7 ']) expect(temTextoSubstantivo(s)).toBe(true)
    for (const s of ['#\ufe0f\u20e3', '*\ufe0f\u20e3', '#\u20e3']) expect(temTextoSubstantivo(s)).toBe(true) // keycaps são sequência (Codex)
    for (const s of ['#', '*', '#*', '\u20e3']) expect(temTextoSubstantivo(s)).toBe(false)
    for (const s of ['❤️', '✔', '➡', '👨‍👩‍👧', '1️⃣', 'ラーメン', "it\u02bcs", '🏴\u{E0067}\u{E0062}\u{E0065}\u{E006E}\u{E0067}\u{E007F}']) expect(temTextoSubstantivo(s)).toBe(true)
  })
  it('um combinador sozinho não é conteúdo; preso a uma letra, a letra é', () => {
    expect(temTextoSubstantivo('\u0301')).toBe(false)
    expect(temTextoSubstantivo('e\u0301')).toBe(true)
  })
})
