/**
 * A IMPRESSÃO (fingerprint) de uma definição de arquétipo: um hash
 * determinístico do JSON canônico (chaves ordenadas). Mesma definição → mesma
 * impressão, em qualquer ordem de chaves; mudança estrutural → impressão
 * diferente. Não é segurança (é cyrb53, puro e isomórfico — sem `node:crypto`,
 * para o editor poder importar): serve para provar que `id@versao` reproduz a
 * mesma definição e, no T1a, para a peça registrar o que usou.
 */
import type { ArquetipoDeLayout } from './tipos'

/**
 * JSON com as chaves ordenadas em todos os níveis (arrays mantêm a ordem: ela é
 * parte da definição). Igual ao `JSON.stringify` no resto: `undefined` some do
 * objeto e vira `null` no array — a impressão da fonte é a da cópia.
 */
export function jsonCanonico(valor: unknown): string {
  if (Array.isArray(valor)) return `[${valor.map((v) => (v === undefined ? 'null' : jsonCanonico(v))).join(',')}]`
  if (valor && typeof valor === 'object') {
    const objeto = valor as Record<string, unknown>
    return `{${Object.keys(objeto)
      .filter((k) => objeto[k] !== undefined)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${jsonCanonico(objeto[k])}`)
      .join(',')}}`
  }
  return JSON.stringify(valor) ?? 'null'
}

/** cyrb53 (domínio público): 53 bits, bem distribuído para detectar mudança. */
function cyrb53(texto: string, semente = 0): number {
  let h1 = 0xdeadbeef ^ semente
  let h2 = 0x41c6ce57 ^ semente
  for (let i = 0; i < texto.length; i++) {
    const c = texto.charCodeAt(i)
    h1 = Math.imul(h1 ^ c, 2654435761)
    h2 = Math.imul(h2 ^ c, 1597334677)
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909)
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909)
  return 4294967296 * (2097151 & h2) + (h1 >>> 0)
}

/** A impressão da definição: `arq1-` + hex. O prefixo muda se a forma de calcular mudar. */
export function impressaoDoArquetipo(arquetipo: ArquetipoDeLayout): string {
  return `arq1-${cyrb53(jsonCanonico(arquetipo)).toString(16).padStart(14, '0')}`
}
