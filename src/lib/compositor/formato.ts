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
import type { Formato } from './spec'

export function formatoDaPaginaGravada(page: { tags?: string[] | null; width: number; height: number }): Formato {
  const tags = page.tags ?? []
  if (tags.includes('story')) return 'story'
  if (tags.includes('feed')) return 'feed'
  if (tags.includes('quadrado')) return 'quadrado'
  if (page.width === page.height) return 'quadrado'
  return page.height > page.width * 1.6 ? 'story' : 'feed'
}
