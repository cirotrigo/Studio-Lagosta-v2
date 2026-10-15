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

/**
 * O que faz um texto ser CONTEÚDO, não só tinta: uma letra, um número ou um pictograma/emoji (propriedades Unicode,
 * sem lista ASCII). `\p{L}` cobre letras de qualquer escrita; `\p{N}` números (11h30, 50%, R$ 79, ½, ²);
 * `\p{Extended_Pictographic}` os emoji e pictogramas (🍷, ☕, ❤) — o Regional Indicator (bandeiras 🇧🇷) entra por
 * `\p{So}` nessa faixa; `\p{Mn}` fica de fora de propósito (combinador sozinho não é conteúdo).
 */
const SUBSTANTIVO = /[\p{L}\p{N}\p{Extended_Pictographic}]|[\u{1F1E6}-\u{1F1FF}]/u

/**
 * "Tem texto SUBSTANTIVO?" — o predicado do guard de remoção de copy (CP4.1, ajuste final do owner): `"."`, `"..."`,
 * `"—"`, `"___"`, `"!!!"`, `"()"`, `"/"`, `"•••"` desenham algo mas não DIZEM nada — trocar "ALMOÇO EXECUTIVO" por "." é
 * apagar a copy com outra sintaxe. `temTextoVisivel` continua respondendo "há algo desenhável?" para a geometria e o
 * revisor; este responde "há conteúdo?" para a proteção da copy. Invisíveis continuam não contando (passa por
 * `textoVisivel`); a qualidade editorial de "Almoço" → "11h" é problema da copy/gate, não deste guard.
 */
export function temTextoSubstantivo(s: unknown): boolean {
  return SUBSTANTIVO.test(textoVisivel(s))
}
