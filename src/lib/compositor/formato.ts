/**
 * O formato de uma página já GRAVADA, pelo classificador do COMPOSITOR: a tag que ele escreveu, ou o tamanho.
 *
 * Extraído de `pastas.ts` (CP5b § 3.1, Codex R11) sem mudar uma linha da lógica: `pastas.ts` importa `@/lib/db` no
 * carregamento e o registro do gate (`revisao/gate-registro.ts`) é puro — uma regra só, nunca cópia. `pastas.ts`
 * reexporta com o nome antigo (`formatoDaPagina`) para os chamadores de fora.
 *
 * Existe um SEGUNDO classificador, o do revisor (`assinatura.ts` `formatoDaPagina`, por nome + tags + tamanho); a
 * identidade da peça guarda os dois e a divergência entre eles é `sem-vinculo` na decisão autônoma.
 *
 * Módulo PURO.
 */
import { FORMATOS, type Formato } from './spec'

/**
 * O formato só pelo TAMANHO da página, sem olhar tag nenhuma (S2, 06/11/2026): é o que a vitrine de modelos, a
 * Bancada e o `escolher-modelo` usam, porque modelo de feed mora em pasta story (a Assinatura do By Rock) e a tag
 * pode estar velha. Lado igual → quadrado; mais de 1,6 vez mais alto que largo → story; o resto → feed.
 */
export function formatoPeloTamanho(width: number, height: number): Formato {
  if (width === height) return 'quadrado'
  return height > width * 1.6 ? 'story' : 'feed'
}

/** A página tem tag de formato (`story`/`feed`/`quadrado`) que discorda do tamanho. */
export function formatoDivergeDoTamanho(tags: string[] | null | undefined, formato: Formato): boolean {
  return (tags ?? []).some((t) => (FORMATOS as readonly string[]).includes(t) && t !== formato)
}

export function formatoDaPaginaGravada(page: { tags?: string[] | null; width: number; height: number }): Formato {
  const tags = page.tags ?? []
  if (tags.includes('story')) return 'story'
  if (tags.includes('feed')) return 'feed'
  if (tags.includes('quadrado')) return 'quadrado'
  return formatoPeloTamanho(page.width, page.height)
}
