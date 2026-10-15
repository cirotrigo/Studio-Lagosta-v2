/**
 * "Tem texto visível?" — o predicado ÚNICO de conteúdo de um texto (CP4.1, revisor A).
 *
 * `trim()` não remove os caracteres de formato (U+200B zero-width space, U+200C/U+200D joiners, U+2060 word joiner,
 * U+00AD soft hyphen, U+FEFF), o combinador vazio U+034F, os fillers Hangul U+3164/U+FFA0 nem o braille em branco
 * U+2800 — todos desenham nada. Um texto feito só deles é copy APAGADA com outra sintaxe. Módulo puro, sem imports.
 */
const INVISIVEIS = /[\p{Cf}͏ㅤﾠ⠀]/gu

/** O texto sem os caracteres que não desenham nada, aparado. */
export function textoVisivel(s: unknown): string {
  return String(s ?? '').replace(INVISIVEIS, '').trim()
}

/** O texto mostra alguma coisa? (`''`, só espaço e só invisíveis → false). */
export function temTextoVisivel(s: unknown): boolean {
  return textoVisivel(s).length > 0
}
