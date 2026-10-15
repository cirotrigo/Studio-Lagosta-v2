/**
 * "Tem texto visível?" — o predicado ÚNICO de conteúdo de um texto (CP4.1, revisor A).
 *
 * `trim()` não remove os caracteres de formato (U+200B zero-width space, U+200C/U+200D joiners, U+2060 word joiner,
 * U+00AD soft hyphen, U+FEFF), o combinador vazio U+034F, os fillers Hangul (U+115F/U+1160, que são LETRAS para o
 * Unicode, U+3164/U+FFA0), os seletores de variação nem o braille em branco U+2800 — todos desenham nada. Um texto
 * feito só deles é copy APAGADA com outra sintaxe. `Default_Ignorable_Code_Point` é a propriedade Unicode que reúne
 * esses "ignoráveis" (caça-bypass do ajuste final, 15/10: os fillers U+115F/U+1160 faltavam na lista manual).
 * Módulo puro, sem imports.
 */
const INVISIVEIS = /[\p{Cf}\p{Default_Ignorable_Code_Point}⠀]/gu

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
 * sem lista ASCII). `\p{L}` cobre letras de qualquer escrita — menos as MODIFICADORAS (`\p{Lm}`: ʼ ʹ ˆ ː, que a
 * pessoa lê como apóstrofo ou acento solto; caça-bypass, 15/10); `\p{N}` números (11h30, 50%, R$ 79, ½, ²);
 * `\p{Extended_Pictographic}` os emoji e pictogramas (🍷, ☕, ❤, ✔) — menos os que o Unicode também classifica como
 * pontuação/símbolo matemático (‼ ⁉ 〰 ↔, o "!!!" do owner num só caractere) e as marcas © ® ™; o Regional Indicator
 * (bandeiras 🇧🇷) entra pela faixa; os keycaps `#️⃣`/`*️⃣` entram como sequência (o seletor de variação some em
 * `textoVisivel`, sobra `#` + U+20E3 — `#` e `*` sozinhos continuam símbolo; Codex, 15/10); `\p{Mn}` fica de fora
 * de propósito (combinador sozinho não é conteúdo).
 */
const SUBSTANTIVO = /(?!\p{Lm})\p{L}|\p{N}|(?![\p{P}\p{Sm}©®™])\p{Extended_Pictographic}|[\u{1F1E6}-\u{1F1FF}]|[#*]\u20E3/u

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
